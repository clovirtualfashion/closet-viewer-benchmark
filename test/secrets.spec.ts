import { secretTestDataTask } from "../src/secrets";
import { isRight } from "fp-ts/Either";

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
