/** Private object storage used by unreviewed FanZone uploads. */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

let storageClient: S3Client | null = null;

function config() {
  const region = process.env.SPACES_REGION;
  const endpoint = process.env.SPACES_ENDPOINT;
  const accessKeyId = process.env.SPACES_KEY;
  const secretAccessKey = process.env.SPACES_SECRET;
  const bucket = process.env.SPACES_BUCKET;
  if (!region || !endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("FanZone storage is not configured.");
  }
  return { region, endpoint, accessKeyId, secretAccessKey, bucket };
}

function client(): S3Client {
  if (storageClient) return storageClient;
  const c = config();
  storageClient = new S3Client({
    region: c.region,
    endpoint: c.endpoint,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    forcePathStyle: false,
  });
  return storageClient;
}

export async function putPrivateFanPhoto(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { bucket } = config();
  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      ContentDisposition: "inline",
      ACL: "private",
      CacheControl: "private, max-age=300",
    }),
  );
}

export async function getPrivateFanPhoto(key: string): Promise<{
  bytes: Uint8Array;
  contentType: string;
  etag: string | null;
}> {
  const { bucket } = config();
  const object = await client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body) throw new Error("Stored image is empty.");
  const bytes = await object.Body.transformToByteArray();
  return {
    bytes,
    contentType: object.ContentType ?? "image/webp",
    etag: object.ETag ?? null,
  };
}

export async function deletePrivateFanPhoto(key: string | null | undefined): Promise<void> {
  if (!key) return;
  const { bucket } = config();
  await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
