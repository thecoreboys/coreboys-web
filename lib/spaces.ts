/**
 * DigitalOcean Spaces upload helper. S3-compatible — we use the AWS
 * SDK's S3Client pointed at the regional endpoint. All admin photo
 * uploads route through here.
 *
 * Returns the CDN-served URL after a successful PUT.
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  const region = process.env.SPACES_REGION;
  const endpoint = process.env.SPACES_ENDPOINT;
  const accessKeyId = process.env.SPACES_KEY;
  const secretAccessKey = process.env.SPACES_SECRET;
  if (!region || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Spaces credentials missing — set SPACES_REGION, SPACES_ENDPOINT, SPACES_KEY, SPACES_SECRET",
    );
  }
  client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // DO Spaces only supports virtual-hosted-style URLs from the regional
    // endpoint; force path-style is wrong here.
    forcePathStyle: false,
  });
  return client;
}

export type UploadInput = {
  /** Object key inside the bucket, e.g. "media/abc.jpg". No leading slash. */
  key: string;
  /** Raw bytes (or stream). */
  body: Uint8Array | Buffer | Blob | ArrayBuffer;
  /** MIME type, e.g. "image/jpeg". */
  contentType: string;
  /** ACL — default 'public-read' so the CDN serves it. */
  acl?: "public-read" | "private";
  /** Optional cache-control. Default = 1 year (immutable assets). */
  cacheControl?: string;
};

export type UploadResult = {
  key: string;
  cdnUrl: string;
};

export async function uploadToSpaces({
  key,
  body,
  contentType,
  acl = "public-read",
  cacheControl = "public, max-age=31536000, immutable",
}: UploadInput): Promise<UploadResult> {
  const bucket = process.env.SPACES_BUCKET;
  const cdn = process.env.SPACES_CDN_ENDPOINT;
  if (!bucket || !cdn) {
    throw new Error(
      "Spaces bucket / CDN endpoint not configured (SPACES_BUCKET, SPACES_CDN_ENDPOINT)",
    );
  }

  let bytes: Uint8Array;
  if (body instanceof Uint8Array) bytes = body;
  else if (body instanceof ArrayBuffer) bytes = new Uint8Array(body);
  else if (typeof Blob !== "undefined" && body instanceof Blob) {
    bytes = new Uint8Array(await body.arrayBuffer());
  } else if (Buffer.isBuffer(body)) {
    bytes = new Uint8Array(body);
  } else {
    throw new Error("uploadToSpaces: unsupported body type");
  }

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      ACL: acl,
      CacheControl: cacheControl,
    }),
  );

  return {
    key,
    cdnUrl: `${cdn.replace(/\/$/, "")}/${key}`,
  };
}

export async function deleteFromSpaces(key: string): Promise<void> {
  const bucket = process.env.SPACES_BUCKET;
  if (!bucket) return;
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
