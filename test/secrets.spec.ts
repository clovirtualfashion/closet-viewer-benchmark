import {secretTestDataTask} from "../src/secrets";
import {isRight} from "fp-ts/Either";




test("secret", ()=>{
    return expect(secretTestDataTask().then(isRight)).resolves.toBeTruthy();
})