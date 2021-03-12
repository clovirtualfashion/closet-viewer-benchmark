import { encodeDynamoFormat } from "./encode-dynamo";
import { right, left } from "fp-ts/Either";
test("test", () => {
  expect(encodeDynamoFormat(3)).toEqual(right({ N: "3" }));
});

test("test", () => {
  expect(encodeDynamoFormat("str")).toEqual(right({ S: "str" }));
});

test("test", () => {
  expect(
    encodeDynamoFormat({
      hi: {
        Iam: "Ingun",
      },
    })
  ).toEqual(
    right({
      M: {
        hi: {
          M: {
            Iam: {
              S: "Ingun",
            },
          },
        },
      },
    })
  );
});
