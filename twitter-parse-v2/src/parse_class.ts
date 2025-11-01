import puppeteer, { Browser, Page, Cookie } from "puppeteer";
import fs from "fs";
import path, { parse } from "path";
import consola from "consola";
import {
	TwitterParserClassOptions,
	PostRaw,
	SearchOptions,
	Timeline,
} from "./types";

export default class TwitterParserClass {
	private browser: Browser;
	private page: Page | undefined;
	private proxy_username: string | null;
	private proxy_password: string | null;
	private cookie_path: string;
	private parse_limit: number;
	private scroll_delay: number;
	private scroll_timeout: number;
	private search_url: string;
	private cookies: Cookie[];
	private ratelimit_timeout: number;
	private navigate_attempt: number = 0;
	constructor(
		browser: Browser,
		search_url: string,
		proxy_username: string | null = null,
		proxy_password: string | null = null,
		cookie_path: string = "cookie.json",
		parse_limit: number = 2,
		scroll_delay: number = 500,
		scroll_timeout: number = 10000,
		ratelimit_timeout: number = 10 * 60 * 1000
	) {
		if (new.target !== TwitterParserClass)
			throw new Error("TwitterParserClass is not callable");
		this.browser = browser;
		this.search_url = search_url;
		this.proxy_username = proxy_username;
		this.proxy_password = proxy_password;
		this.cookie_path = cookie_path;
		this.parse_limit = parse_limit;
		this.scroll_delay = scroll_delay;
		this.scroll_timeout = scroll_timeout;
		this.ratelimit_timeout = ratelimit_timeout;
		this.page = undefined;

		if (!fs.existsSync(path.resolve(this.cookie_path))) {
			this.cookies = [];
			return;
		}
		const read_json = fs.readFileSync(
			path.resolve(this.cookie_path),
			"utf-8"
		);
		const parse_json = JSON.parse(read_json);
		if (!Array.isArray(parse_json))
			throw new Error("cookie file is not an array");
		this.cookies = parse_json;
		return;
	}
	public static async initializeWithOptions(
		search_url: string,
		options: TwitterParserClassOptions
	): Promise<TwitterParserClass> {
		return new TwitterParserClass(
			await puppeteer.launch({
				headless: options.headless ?? false,
			}),
			search_url,
			options.proxy_username,
			options.proxy_password,
			options.cookie_path,
			options.parse_limit,
			options.scroll_delay,
			options.scroll_timeout,
			options.ratelimit_timeout
		);
	}
	public static async initialize(
		search_url: string
	): Promise<TwitterParserClass> {
		return new TwitterParserClass(
			await puppeteer.launch({
				headless: false,
			}),
			search_url
		);
	}
	public async authenticate(): Promise<void> {
		if (this.cookies.length > 0)
			this.cookies.map((cookie) => {
				this.browser.setCookie(cookie);
			});
		if (this.page === undefined) this.page = await this.browser.newPage();
		if (this.proxy_password !== null && this.proxy_username !== null)
			await this.page.authenticate({
				username: this.proxy_username,
				password: this.proxy_password,
			});
		await this.page.goto("https://x.com/login");
		await this.page.waitForFunction(
			() => window.location.href === "https://x.com/home"
		);
		consola.success("Successfully logged into twitter");
		const cookies = await this.browser.cookies();
		fs.writeFileSync(this.cookie_path, JSON.stringify(cookies));
		consola.success("Saved new cookie data");
		return;
	}
	public async navigate(): Promise<void> {
		if (this.page === undefined) throw new Error("Page is still undefined");
		await this.page.goto(this.search_url, {
			waitUntil: "networkidle2",
		});
		await this.page.waitForSelector(
			'[aria-label="Timeline: Cari timeline"]',
			{
				timeout: 5000,
			}
		);
		await new Promise((res) => {
			consola.log("Waiting for full load");
			setTimeout(res, 5000);
		});
		consola.success("Loaded timeline");
		return;
	}
	public async navigateRecursive(): Promise<void> {
		while (true) {
			try {
				await this.navigate();
				break;
			} catch (error: any) {
				if (error.name === "TimeoutError") {
					consola.warn(
						`Ratelimit detected at attempt ${++this
							.navigate_attempt}. Retrying in ${
							this.ratelimit_timeout / 1000 / 60
						} minutes...`
					);
					await new Promise((resolve) =>
						setTimeout(resolve, this.ratelimit_timeout)
					);
				} else {
					throw error;
				}
			}
		}
		return;
	}
	public async scroll(): Promise<void> {
		if (this.page === undefined) throw new Error("Page is still undefined");
		await this.page.evaluate(() => window.scrollBy(0, 100));
	}
	public async getPosts(): Promise<PostRaw[]> {
		if (this.page === undefined) throw new Error("Page is still undefined");

		// Define the interface so TypeScript knows the structure inside page.evaluate()
		interface PostRaw {
			id: string;
			author: string;
			time: string;
			content: string;
			engagement: {
				replies: number;
				retweets: number;
				likes: number;
			};
		}

		return (await this.page.evaluate(
			(parse_limit, scroll_timeout) => {
				// FIX: We must wrap the logic in a Promise to access resolve/reject
				return new Promise<PostRaw[]>((resolve, reject) => {
					const newData: PostRaw[] = []; // FIX: Explicitly type the array
					const seenPostIds = new Set<string>();
					const clearFunc = (dataToResolve: PostRaw[]) => {
						observer.disconnect();
						resolve(dataToResolve);
					};
					const timeoutId = setTimeout(() => {
						clearFunc(newData); // FIX: resolve(newData) is now safe inside clearFunc
					}, scroll_timeout);
					const observer = new MutationObserver((mutations) => {
						mutations.forEach((mutation) => {
							mutation.addedNodes.forEach((node) => {
								if (node.nodeType !== Node.ELEMENT_NODE) return;
								const elementNode = node as HTMLElement;

								const tweet = elementNode.querySelector(
									'[data-testid="tweet"]'
								);
								if (!tweet) return;

								if (
									tweet.querySelector(
										'[data-testid="promotedTweet"]'
									)
								)
									return;

								const linkElement = tweet
									.querySelector('a[href*="/status/"] time')
									?.closest("a");
								const href = linkElement?.getAttribute("href");
								const postId = href?.split("/").pop();

								if (!postId || seenPostIds.has(postId)) return;

								// --- Simplified Parsing Logic ---
								const author =
									tweet.querySelector(
										'[data-testid="User-Name"]'
									)?.textContent ?? "Unknown Author";
								const time =
									tweet
										.querySelector("time[datetime]")
										?.getAttribute("datetime") ??
									"DATEUNDEFINED";

								// Click "Show More"
								const showMoreButton = tweet.querySelector(
									'[data-testid="tweet-text-show-more-button"]'
								) as HTMLElement;
								if (showMoreButton) showMoreButton.click();

								const content =
									tweet.querySelector(
										'[data-testid="tweetText"]'
									)?.textContent ?? "";

								// Engagement parsing (Assuming parseEngagementValue is available/inlined)
								const parseEngagementValue = (
									text: string | null | undefined
								): number => {
									if (!text) return 0;
									const textLower = text.toLowerCase();
									const num = parseFloat(
										text.replace(/,/g, "")
									);
									if (textLower.endsWith("k"))
										return Math.floor(num * 1000);
									if (textLower.endsWith("m"))
										return Math.floor(num * 1000000);
									return num;
								};

								const replies = parseEngagementValue(
									tweet.querySelector('[data-testid="reply"]')
										?.textContent
								);
								const retweets = parseEngagementValue(
									tweet.querySelector(
										'[data-testid="retweet"]'
									)?.textContent
								);
								const likes = parseEngagementValue(
									tweet.querySelector('[data-testid="like"]')
										?.textContent
								);

								// --- Add Data and Check Limit ---
								seenPostIds.add(postId);
								newData.push({
									id: postId,
									author: author,
									time: time,
									content: content,
									engagement: { replies, retweets, likes },
								});

								if (newData.length >= parse_limit) {
									clearFunc(newData); // FIX: resolve(newData) is now safe inside clearFunc
								}
							});
						});
					});

					const container = document.querySelector(
						'[aria-label="Timeline: Cari timeline"] > div'
					);

					if (container === null) {
						reject(new Error("Element couldn't be found"));
						return;
					}

					observer.observe(container, { childList: true });
				});
			},
			this.parse_limit,
			this.scroll_timeout
		)) as PostRaw[];
	}
	public async parse(): Promise<PostRaw[]> {
		if (this.page === undefined) throw new Error("Page is still undefined");
		const scrollinterval = setInterval(
			() => this.page?.evaluate(() => window.scrollBy(0, 100)),
			this.scroll_delay
		);
		const data: PostRaw[] = await this.getPosts();
		clearInterval(scrollinterval);
		return data;
	}
	public getScrollDelay(): number {
		return this.scroll_delay;
	}
	public setSearchURL(url: string): void {
		this.search_url = url;
	}
	public getRatelimitTimeout(): number {
		return this.ratelimit_timeout;
	}
	public static generateSearchURL(options: SearchOptions): string {
		if (options.plaintext) {
			const urlEncoded = encodeURIComponent(options.plaintext);
			const searchparam = `q=${urlEncoded}`;
			const urlbuilder = [];
			urlbuilder.push(searchparam);
			if (options.timeline == Timeline.LATEST) urlbuilder.push(`f=live`);
			if (options.timeline == Timeline.TOP) urlbuilder.push(`f=top`);
			return `https://www.x.com/search?${urlbuilder.join("&")}`;
		}
		const querybuilder: string[] = [];
		if (options.by) querybuilder.push(`from:${options.by}`);
		if (options.replies) querybuilder.push(`to:${options.replies}`);
		if (options.mentions) querybuilder.push(`@${options.mentions}`);
		if (options.exact) querybuilder.push(`"${options.exact}"`);
		if (Array.isArray(options.includes) && options.includes.length != 0) {
			for (const words of options.includes) {
				querybuilder.push(`"${words}"`);
			}
		}
		if (Array.isArray(options.excludes) && options.excludes.length != 0) {
			for (const words of options.excludes) {
				querybuilder.push(`-"${words}"`);
			}
		}
		if (Array.isArray(options.either) && options.either.length > 0) {
			const cleanedoptions = options.either.map((token) => `"${token}"`);
			querybuilder.push(`(${cleanedoptions.join(" OR ")})`);
		}
		if (Array.isArray(options.filters) && options.filters.length > 0) {
			for (const filter of options.filters) {
				querybuilder.push(`filter:${filter.toLowerCase()}`);
			}
		}
		if (options.since !== undefined) {
			const year = options.since.getFullYear();
			const month = String(options.since.getMonth() + 1).padStart(2, "0");
			const date = String(options.since.getDate()).padStart(2, "0");
			querybuilder.push(`since:${year}-${month}-${date}`);
		}
		if (options.until !== undefined) {
			const year = options.until.getFullYear();
			const month = String(options.until.getMonth() + 1).padStart(2, "0");
			const date = String(options.until.getDate()).padStart(2, "0");
			querybuilder.push(`until:${year}-${month}-${date}`);
		}
		const fullquery = querybuilder.join(" ");
		const urlbuilder: string[] = [];
		if (options.timeline == Timeline.LATEST) urlbuilder.push(`f=live`);
		if (options.timeline == Timeline.TOP) urlbuilder.push(`f=top`);
		urlbuilder.push("src=typed_query");
		urlbuilder.push(`q=${encodeURIComponent(fullquery)}`);
		return `https://www.x.com/search?${urlbuilder.join("&")}`;
	}
}
