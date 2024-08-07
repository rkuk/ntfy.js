import Ntfy from "./index.js";

async function main() {
    let ntfy = new Ntfy({ Cache: false });//set default config when constructing
    let resp = await ntfy.Send(
        "test",//Topic, optional if set when constructing
        {
            Title: "The Title", //optional
            Message: "The Content", //optional
            Priority: Ntfy.Priority.HIGH, //optional
            Icon: "https://www.baidu.com/img/flexible/logo/pc/result.png", //optional
            Delay: 0, //optional
            Cache: false, //optional
            Markdown: false, //optional
            Tags: ["rocket", "house"], //optional
            Attach: "https://www.baidu.com/img/flexible/logo/pc/result.png", //optional, url or local file path
            Filename: "" //optional
        },
        "https://bing.com", //click: optional
        ntfy.MakeAction("view", "Search", "https://baidu.com"), //action: optional
        ntfy.MakeAction("http", "Reply", { url: "https://ntfy.sh/test", headers: { "Message": "reply" } }) //action: optional
    );
    console.log(resp);
}

main();
