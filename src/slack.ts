import { WebClient } from "@slack/web-api";
import { slackToken } from "./secrets";

const client = slackToken()
  .then((tk) => new WebClient(tk))
  .catch((err) => {
    console.error(err);
    return null;
  });

export function noti(message: string) {
  return client
    .then((web) => {
      if (web)
        return web.chat.postMessage({
          channel: "#z_alert_closet_viewer",
          text: message,
        });
      else throw "web is null";
    })
    .catch(console.error)
    .finally(() => console.log("SENT MESSAGE"));
}
