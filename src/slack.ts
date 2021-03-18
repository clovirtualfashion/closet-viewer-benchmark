import {WebClient} from "@slack/web-api";

const SLACK_TOKEN = process.env.SLACK_TOKEN;

const web = new WebClient(SLACK_TOKEN);

export function noti(message: string) {
  return web.chat.postMessage({
    channel: "#z_alert_closet_viewer",
    text: message,
  }).catch(console.error).finally(()=>console.log("SENT MESSAGE"));
}
