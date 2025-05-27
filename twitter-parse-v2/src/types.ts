interface PostRaw {
	author: string;
	time: string;
	content: string;
	data: string;
	id: string;
}
type TwitterFilter =
	| "media"
	| "twimg"
	| "images"
	| "videos"
	| "periscope"
	| "native_video"
	| "vine"
	| "consumer_video"
	| "pro_video"
	| "verified"
	| "blue_verified"
	| "follows"
	| "social"
	| "trusted"
	| "safe"
	| "news"
	| "spaces"
	| "replies"
	| "retweets"
	| "nativeretweets"
	| "quote"
	| "links";
enum Timeline {
	TOP,
	LATEST,
}
interface SearchOptions {
	plaintext?: string;
	by?: string;
	replies?: string;
	mentions?: string;
	exact?: string;
	includes?: string[];
	excludes?: string[];
	either?: string[];
	filters?: TwitterFilter[];
	since?: Date;
	until?: Date;
	timeline: Timeline;
}
interface TwitterParserClassOptions {
	proxy_username?: string;
	proxy_password?: string;
	headless?: boolean;
	cookie_path?: string;
	parse_limit?: number;
	scroll_delay?: number;
	scroll_timeout?: number;
	ratelimit_timeout?: number;
}

interface Proxy {
	username: string;
	password: string;
}

interface BaseArgs {
	config: string;
	until?: string;
}

interface ModeDefault extends BaseArgs {
	mode: "default" | "continue";
	id?: string;
}

interface ModeCustom extends BaseArgs {
	mode: "custom";
	id: string; // required here
}

type CLIArgs = ModeDefault | ModeCustom;

interface ConfigType {
	parse_limit?: number;
	scroll_delay?: number;
	scroll_timeout?: number;
	ratelimit_timeout?: number;
	plaintext?: string;
	by?: string;
	replies?: string;
	mentions?: string;
	exact?: string;
	includes?: string[];
	excludes?: string[];
	either?: string[];
	filters?: (
		| "media"
		| "twimg"
		| "images"
		| "videos"
		| "periscope"
		| "native_video"
		| "vine"
		| "consumer_video"
		| "pro_video"
		| "verified"
		| "blue_verified"
		| "follows"
		| "social"
		| "trusted"
		| "safe"
		| "news"
		| "spaces"
		| "replies"
		| "retweets"
		| "nativeretweets"
		| "quote"
		| "links"
	)[];
	since?: Date;
	until?: Date;
	timeline: 0 | 1; // matches Timeline enum values
}

export {
	PostRaw,
	TwitterFilter,
	Timeline,
	SearchOptions,
	TwitterParserClassOptions,
	Proxy,
	BaseArgs,
	ModeDefault,
	ModeCustom,
	CLIArgs,
	ConfigType,
};
