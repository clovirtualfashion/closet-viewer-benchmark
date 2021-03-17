// Use this code snippet in your app.
// If you need more information about configurations or implementing the sample code, visit the AWS docs:
// https://aws.amazon.com/developers/getting-started/nodejs/
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import * as D from "io-ts/Decoder";
import { tryCatchK } from "fp-ts/TaskEither";
import { pipe } from "fp-ts/lib/function";
import {array, record, taskEither} from "fp-ts";
import { GetObjectCommand, S3Client, } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";

// Load the AWS SDK
const region = "ap-northeast-2",
  secretName = "closet-viewer-test-data";
// secret,
// decodedBinarySecret;

// Create a Secrets Manager client
const secretClient = new SecretsManagerClient({
  region: region,
});

const s3Client = new S3Client({
  region,
});

// In this sample we only handle the specific exceptions for the 'GetSecretValue' API.
// See https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
// We rethrow the exception by default.
const secretRequest = () =>
  secretClient.send(
    new GetSecretValueCommand({
      SecretId: secretName,
    })
  );

const secretTask = tryCatchK(secretRequest, (err) => {
  const code = (err as any).code;
  if (code && typeof code === "string") {
    console.error("Failed to get secret value", code);
  } else {
    console.error(err);
  }
});

const secretTestData = D.type({
  zrests: D.record(D.type({ key: D.string })),
  srests: D.record(D.type({ key: D.string })),
});

const bucket = "closet-viewer-test-data";

const downloadTextRequest = (config: { Bucket: string; Key: string }) =>
  s3Client.send(new GetObjectCommand(config)).then(async (xx) => {
    const b = xx.Body;
    if (b instanceof Readable) {
      let result = "";
      for await (const chunk of b) {
        result += chunk;
      }
      return result;
    } else {
      throw "b is not Readable";
    }
  });

const downloadTextTask = tryCatchK(downloadTextRequest, (err) => {
  console.error("Failed to download", err);
});

function key2URL(Key:string, Bucket: string) {
    return getSignedUrl(s3Client as any, new GetObjectCommand({Key, Bucket}) as any, {
        expiresIn: 60 * 30 // 30 minutes
    })
}

const key2URLTask = tryCatchK(key2URL, (err) => {
    console.error("Failed to create presigned url", err);
})

const SRest = D.type({
  dracos: D.array(D.string),
  images: D.array(D.string),
  rest: D.array(D.string),
});

export const secretTestDataTask = pipe(
  secretTask(),
  taskEither.map((x) => x.SecretString),
  taskEither.chainEitherKW(D.string.decode),
  taskEither.map(JSON.parse),
  taskEither.chainEitherKW(secretTestData.decode),
  taskEither.chain(({ zrests, srests }) => {
    return pipe(
      srests,
      record.map((xx) =>
        pipe(
          downloadTextTask({ Bucket: bucket, Key: xx.key }),
          taskEither.map(JSON.parse),
          taskEither.chainEitherKW(SRest.decode),
          taskEither.map(record.map(array.map(key => {
            return key2URLTask(key, bucket);
          }))),
          taskEither.map(record.map(taskEither.sequenceArray)),
          taskEither.chainW(record.sequence(taskEither.taskEither)),
        )
      ),
      record.sequence(taskEither.taskEither),
      taskEither.map((srests) => ({
        zrests,
        srests,
      }))
    );
  }),
  taskEither.mapLeft((x) => x as any)
);