"""Refresh admin-managed identities without changing protected media configuration."""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping

from .authority import _db_modules, configured_database_url
from .config import AnalyzerConfig, Consent, Identity
from .errors import DataError, PolicyError


def merge_database_people(
    config: AnalyzerConfig,
    people: Iterable[Mapping[str, Any]],
    assignments: Iterable[Mapping[str, Any]],
) -> AnalyzerConfig:
    """Use DB UUIDs for new people; retain existing local template IDs on upgrade.

    Revoked people remain resolvable for local template purges, but never enter
    a matching allowlist. No names, links, images or model bytes come from SQL.
    """
    by_canonical = {(person.canonical_kind, person.canonical_slug): person.id for person in config.identities.values()}
    identities = dict(config.identities)
    db_to_local: dict[str, str] = {}
    active_consents: dict[str, str] = {}
    now = datetime.now(timezone.utc)
    for row in people:
        canonical = (row["canonical_kind"], row["canonical_slug"])
        if canonical[0] not in {"member", "crew", "guest"}:
            raise DataError("database registry returned an unsupported canonical kind")
        identity_uuid = str(row["identity_id"])
        local_id = by_canonical.get(canonical, identity_uuid)
        existing = identities.get(local_id)
        if existing and (existing.canonical_kind, existing.canonical_slug) != canonical:
            raise DataError("database identity ID conflicts with a configured local identity")
        active = bool(row["identity_state"] == "active" and row["consent_id"]
                      and row["subject_confirmed_adult"] and row["revoked_at"] is None
                      and row["expires_at"] > now)
        identities[local_id] = Identity(
            id=local_id, display_name=canonical[1], canonical_kind=canonical[0], canonical_slug=canonical[1],
            consent=Consent(
                biometric_template=active and bool(row["allow_template_creation"]),
                live_matching=False,
                archive_matching=active and bool(row["allow_archive_matching"]),
                public_tag=False,  # publication remains a separate web decision
                granted_at=row["created_at"] or now,
                expires_at=row["expires_at"] or now,
            ),
        )
        db_to_local[identity_uuid] = local_id
        if active:
            active_consents[identity_uuid] = str(row["consent_id"])
    by_content: dict[str, set[str]] = {}
    for row in assignments:
        identity_uuid = str(row["identity_id"])
        if identity_uuid in db_to_local and active_consents.get(identity_uuid) == str(row["consent_id"]):
            by_content.setdefault(row["content_id"], set()).add(db_to_local[identity_uuid])
    sources = {
        key: replace(source, participant_allowlist=frozenset(by_content.get(source.content_id, set())))
        for key, source in config.sources.items()
    }
    sessions = {
        key: replace(session, identity_allowlist=sources[session.source_id].participant_allowlist)
        for key, session in config.sessions.items()
    }
    return replace(config, identities=identities, sources=sources, sessions=sessions)


def refresh_database_people(config: AnalyzerConfig) -> AnalyzerConfig:
    if config.identity_registry != "database":
        return config
    dsn = configured_database_url()
    if dsn is None:
        raise PolicyError("database identity registry requires FACE_ANALYZER_DATABASE_URL; no local fallback")
    psycopg, dict_row, _ = _db_modules()
    try:
        with psycopg.connect(dsn, connect_timeout=5, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT identities.id::text AS identity_id, identities.state AS identity_state,
                           identities.canonical_kind, identities.canonical_slug,
                           consents.id::text AS consent_id, consents.subject_confirmed_adult,
                           consents.allow_template_creation, consents.allow_archive_matching,
                           consents.revoked_at, consents.created_at, consents.expires_at
                      FROM face_identities identities
                      LEFT JOIN LATERAL (
                        SELECT id, subject_confirmed_adult, allow_template_creation,
                               allow_archive_matching, revoked_at, created_at, expires_at
                          FROM face_consents WHERE identity_id=identities.id
                         ORDER BY created_at DESC LIMIT 1
                      ) consents ON true
                """)
                people = cursor.fetchall()
                cursor.execute("""
                    SELECT sources.content_id, allowed.identity_id::text, allowed.consent_id::text
                      FROM face_source_identities allowed
                      JOIN face_sources sources ON sources.id=allowed.source_id
                     WHERE sources.source_kind='archive' AND sources.state <> 'archived'
                """)
                assignments = cursor.fetchall()
        return merge_database_people(config, people, assignments)
    except (PolicyError, DataError):
        raise
    except Exception as exc:
        raise DataError("database identity refresh failed closed") from exc
