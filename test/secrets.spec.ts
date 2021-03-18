import { secretTestDataTask } from "../src/secrets";
import { isRight } from "fp-ts/Either";
import { noti } from "../src/slack";

test("secret", () => {
  return expect(
    secretTestDataTask().then((x) => {
      if (isRight(x)) {
        console.log(x.right);
        // console.log(x.right.srests);
        return true;
      } else {
        console.error(x.left);
        return false;
      }
    })
  ).resolves.toBeTruthy();
});

test("slack", () => {
  return expect(
    noti("closet-viewer-benchmark unit test success")
  ).resolves.toBeTruthy();
});
