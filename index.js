import fs from "node:fs";
import path from "node:path";

export class Ntfy {

    static Priority = {
        MIN: 1,
        LOW: 2,
        DEFAULT: 3,
        HIGH: 4,
        MAX: 5
    }

    static #Defaults = {
        Url: "https://ntfy.sh",
        User: undefined,
        Password: undefined,
        Token: undefined,
        Topic: undefined,
        Title: "",
        Message: "",
        Tags: [],
        Icon: "",
        Delay: undefined,
        Cache: true,
        Click: undefined,
        Actions: [],
        Priority: Ntfy.Priority.DEFAULT,
        Markdown: false
    };

    #authInfo;
    #defaults;

    constructor(url, user, password, defaults) {
        switch (arguments.length) {
            case 0:
                this.#init0();
                break;
            case 1:
                this.#init1(url);
                break;
            case 2:
                this.#init2(url, user);
                break;
            case 3:
                this.#init3(url, user, password);
                break;
            case 4:
                this.#init4(url, user, password, defaults);
                break;
            default:
                throw new Error("arguments error Ntfy constructor");
        }
    }

    #parseOptions(options) {
        options = options || {};
        let config = {};
        for (let prop in Ntfy.#Defaults) {
            if (prop in options)
                config[prop] = options[prop]
            else if (prop.toLowerCase() in options)
                config[prop] = options[prop.toLowerCase()];
            else
                config[prop] = Ntfy.#Defaults[prop];
        }
        return config;
    }

    #init0() {
        this.#init1(this.#parseOptions());
    }
    #init1(urlOrOptions) {
        if (typeof urlOrOptions == "string") { //url
            let options = this.#parseOptions();
            options["Url"] = urlOrOptions;
            urlOrOptions = options;
        }
        this.#defaults = this.#parseOptions(urlOrOptions);
        this.#login();
    }
    #init2(url, tokenOrOptions) {
        if (typeof tokenOrOptions == "string") { //token
            let config = this.#parseOptions();
            config.Token = tokenOrOptions;
            tokenOrOptions = config;
        }
        tokenOrOptions.Url = url;
        this.#init1(tokenOrOptions);
    }
    #init3(url, userOrToken, passwordOrOptions) {
        if (typeof passwordOrOptions == "string") { //password
            let config = this.#parseOptions();
            config.User = userOrToken;
            config.Password = passwordOrOptions;
            passwordOrOptions = config;
        } else
            passwordOrOptions.Token = userOrToken;

        passwordOrOptions.Url = url;
        this.#init1(passwordOrOptions);
    }
    #init4(url, user, password, options) {
        options.Url = url;
        options.User = user;
        options.Password = password;
        this.#init1(options);
    }

    #login() {
        if (this.#defaults.User && this.#defaults.Password)
            return this.#authInfo = {
                'Authorization': "Basic " + btoa(`${this.#defaults.User}:${this.#defaults.Password}`)
            };

        if (this.#defaults.Token && this.#defaults.Token.startsWith("tk_"))
            return this.#authInfo = {
                'Authorization': `Bearer ${this.#defaults.Token}`
            };
    }

    #parseMessage(message) {
        if (!(message instanceof TextMessage ||
            message instanceof UrlAttachMessage ||
            message instanceof LocalAttachMessage)) {
            let MsgClass = TextMessage;
            if (typeof (message) == "string") {
                message = {
                    Message: message
                };
            } else if ("Attach" in message || "attach" in message) {
                MsgClass = /^https?:\/\//i.test(message.Attach || message.attach) ?
                    UrlAttachMessage : LocalAttachMessage;
            }
            message = new MsgClass(message);
        }

        //use defaut config when neccessary
        for (let prop in message) {
            if (message[prop] == undefined)
                message[prop] = this.#defaults[prop];
        }

        if (!message.Delay)
            delete message.Delay;
        if (!message.Cache)
            message.Cache = "no";

        return message;
    }

    async Send(topic, message, click, ...actionButtons) {
        switch (arguments.length) {
            case 0:
                throw new Error("Message is not specified");
            case 1:
                return await this.#send1(topic);
            default:
                return await this.#send2(topic, ...([message, click].concat(actionButtons)));
        }
    }

    async #send(topic, message, click, actions) {
        if (!topic)
            throw new Error("Topic is not specified");

        message = this.#parseMessage(message);
        let headers = {
            ...this.#authInfo,
            ...message
        };
        if (click) headers["Click"] = click;
        if (actions && actions.length > 0) headers["Actions"] = actions.join(";");
        // if (message instanceof LocalAttachMessage)
        //     delete headers.Attach;

        let resp = await fetch(`${this.#defaults.Url}/${topic}`, {
            method: 'PUT',
            headers,
            body: message instanceof LocalAttachMessage ? message.FileData : ""
        });

        return await resp.json();
    }
    async #send1(message) {
        return await this.#send(this.#defaults.Topic, message);
    }
    async #send2(topicOrMessage, ...messageOrClickOrActions) {
        let topic = this.#defaults.Topic;
        let message = messageOrClickOrActions.find(findMessage);
        let click = messageOrClickOrActions.find(findClick);
        let actions = messageOrClickOrActions.filter(findAction);
        if (message) //message in in messageOrClickOrActions
            topic = topicOrMessage || topic;
        else //topicOrMessage is message
            message = topicOrMessage

        return await this.#send(topic, message, click, actions);
    }

    /**
     *
     * param action [String] view, broadcast, http
     */
    MakeAction(action, label, urlOrIntentOrExtra, clear = true) {
        let result = [];
        if (typeof urlOrIntentOrExtra == "string")
            result = [action, label, urlOrIntentOrExtra, `clear=${clear}`];//payload is url
        else {
            let urlOrIntent, payload;
            if (action == "http") {
                urlOrIntent = getConfigAttr(urlOrIntentOrExtra, "Url");
                payload = {
                    method: getConfigAttr(urlOrIntentOrExtra, "Method"),
                    headers: getConfigAttr(urlOrIntentOrExtra, "Headers"),
                    body: getConfigAttr(urlOrIntentOrExtra, "Body"),
                };
            }
            else if (action == "broadcast") {
                urlOrIntent = getConfigAttr(urlOrIntentOrExtra, "Intent");
                payload = {
                    extras: getConfigAttr(urlOrIntentOrExtra, "Extras"),
                };

            } else
                throw new Error(`Action "${action} not support"`);

            result = [action, label, urlOrIntent, ...this.#flattenPayload(payload), `clear=${clear}`];
        }
        return result.join(",");
    }

    #flattenPayload(payload, prefix) {
        let result = [];
        for (let prop in payload) {
            let value = payload[prop];
            prop = prefix ? `${prefix}.${prop}` : prop;
            if (typeof (value) == "object")
                result = result.concat(this.#flattenPayload(value, prop));
            else if (value != undefined)
                result.push(`${prop}=${value}`);
        }
        return result;
    }
}

function findClick(v) {
    return typeof v == "string" && /^(geo:|mailto:|\w+:\/\/)/i.test(v);
}

function findAction(v) {
    return typeof v == "string" && /^(view|broadcast|http),/i.test(v);
}

function findMessage(v) {
    return !findClick(v) && !findAction(v);
}

function getConfigAttr(config, attr) {
    return attr in config ? config[attr] : config[attr.toLowerCase()];
}

export class TextMessage {
    Title;
    Message;
    Priority;
    Icon;
    Delay;
    Cache;
    Markdown;
    Tags;

    constructor(config) {
        this.Message = getConfigAttr(config, "Message");
        this.Title = getConfigAttr(config, "Title");
        this.Priority = getConfigAttr(config, "Priority");
        this.Icon = getConfigAttr(config, "Icon");
        this.Delay = getConfigAttr(config, "Delay");
        this.Cache = getConfigAttr(config, "Cache");
        this.Markdown = getConfigAttr(config, "Markdown");
        this.Tags = getConfigAttr(config, "Tags");
    }

    SetMessage(message) {
        this.Message = message;
        return this;
    }
    SetTitle(title) {
        this.Title = title;
        return this;
    }
    SetPriority(priority) {
        this.Priority = priority;
        return this;
    }
    SetIcon(icon) {
        this.Icon = icon;
        return this;
    }
    SetDelay(delay) {
        this.Delay = delay;
        return this;
    }
    SetCache(isCached) {
        this.Cache = isCached;
        return this;
    }
    SetMarkdow(isMarkdown) {
        this.Markdown = isMarkdown;
        return this;
    }
    SetTags(...tags) {
        this.Tags = tags;
        return this;
    }
}

export class UrlAttachMessage extends TextMessage {
    #fileName;
    Attach;

    constructor(config) {
        super(config);
        this.Attach = getConfigAttr(config, "Attach");;
        this.#fileName = getConfigAttr(config, "Filename");;
        Object.defineProperty(this, "Filename", {
            enumerable: true, //make Filename enumerable to be assign
            get: () => this.#fileName || path.basename(this.Attach),
            set: value => this.#fileName = value
        });
    }

    SetFilename(filename) {
        this.Filename = filename;
        return this;
    }
    SetAttach(attach) {
        this.Attach = attach;
        return this;
    }
}

export class LocalAttachMessage extends UrlAttachMessage {
    #fileDataBuffer;

    constructor(config) {
        super(config);
        Object.defineProperty(this, "Attach", {
            enumerable: false//make LocalAttachMessage.Attach not enumerable to avoid ntfy's complain
        });
    }

    get FileData() {
        if (!this.#fileDataBuffer)
            this.#fileDataBuffer = fs.readFileSync(this.Attach);
        return this.#fileDataBuffer;
    }
}

export default Ntfy;
