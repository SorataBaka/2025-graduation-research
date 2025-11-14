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
		if (!this.page) throw new Error("Page is still undefined");

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
				return new Promise<PostRaw[]>((resolve, reject) => {
					const newData: PostRaw[] = [];
					const seenPostIds = new Set<string>();

					let lastMutationTime = Date.now();
					const INACTIVITY_LIMIT = 8000; // 8s before checking retry/end
					const MAX_RETRIES = 10;
					const RETRY_DELAY = 30000; // 30s
					let retryCount = 0;
					let retryCooldown = false; // prevents instant re-clicking

					const clearFunc = (dataToResolve: PostRaw[]) => {
						try {
							observer.disconnect();
						} catch {}
						clearInterval(inactivityCheck);
						resolve(dataToResolve);
					};

					// ✅ Retry only max 10 times, with 30s cooldown between retries
					const clickRetryIfExists = () => {
						if (retryCooldown) return false;

						const retryBtn =
							document.querySelector('[data-testid="error-retry"]') ||
							[...document.querySelectorAll("button")].find((b) =>
								b.textContent?.toLowerCase().includes("coba lagi") ||
								b.textContent?.toLowerCase().includes("retry")
							);

						if (retryBtn) {
							if (retryCount >= MAX_RETRIES) {
								console.warn(`⚠ Max retries (${MAX_RETRIES}) reached — stopping retries.`);
								return false;
							}

							console.warn(`⚠ Connection issue — retrying (${retryCount + 1}/${MAX_RETRIES})`);
							(retryBtn as HTMLElement).click();
							retryCount++;
							retryCooldown = true;
							lastMutationTime = Date.now();

							setTimeout(() => {
								retryCooldown = false;
							}, RETRY_DELAY);

							return true;
						}
						return false;
					};

					// ✅ Watchdog for timeline freeze or actual end
					const inactivityCheck = setInterval(() => {
						const elapsed = Date.now() - lastMutationTime;
						if (elapsed > INACTIVITY_LIMIT) {
							if (!clickRetryIfExists()) {
								console.log("✅ No more tweets — finishing.");
								clearFunc(newData);
							}
						}
					}, 1000);

					// ✅ Hard stop after scroll_timeout
					setTimeout(() => clearFunc(newData), scroll_timeout);

					const observer = new MutationObserver((mutations) => {
						// ✅ New activity = reset retry attempts
						retryCount = 0;
						lastMutationTime = Date.now();

						for (const mutation of mutations) {
							for (const node of mutation.addedNodes) {
								if (node.nodeType !== Node.ELEMENT_NODE) continue;
								const tweet = (node as HTMLElement).querySelector('[data-testid="tweet"]');
								if (!tweet) continue;
								if (tweet.querySelector('[data-testid="promotedTweet"]')) continue;

								const link = tweet.querySelector('a[href*="/status/"] time')?.closest("a");
								const postId = link?.getAttribute("href")?.split("/").pop();
								if (!postId || seenPostIds.has(postId)) continue;

								const author =
									tweet.querySelector('[data-testid="User-Name"]')?.textContent ||
									"Unknown Author";
								const time =
									tweet.querySelector("time[datetime]")?.getAttribute("datetime") ||
									"DATEUNDEFINED";

								const showMore = tweet.querySelector(
									'[data-testid="tweet-text-show-more-button"]'
								) as HTMLElement;
								if (showMore) showMore.click();

								const content =
									tweet.querySelector('[data-testid="tweetText"]')?.textContent || "";

								const parseEngValue = (text: string | null | undefined) => {
									if (!text) return 0;
									const lower = text.toLowerCase();
									const num = parseFloat(text.replace(/,/g, ""));
									if (lower.endsWith("k")) return Math.floor(num * 1000);
									if (lower.endsWith("m")) return Math.floor(num * 1_000_000);
									return num;
								};

								const replies = parseEngValue(tweet.querySelector('[data-testid="reply"]')?.textContent);
								const retweets = parseEngValue(tweet.querySelector('[data-testid="retweet"]')?.textContent);
								const likes = parseEngValue(tweet.querySelector('[data-testid="like"]')?.textContent);

								seenPostIds.add(postId);
								newData.push({
									id: postId,
									author,
									time,
									content,
									engagement: { replies, retweets, likes },
								});

								if (newData.length >= parse_limit) {
									clearFunc(newData);
									return;
								}
							}
						}
					});

					const container = document.querySelector('[aria-label="Timeline: Cari timeline"] > div');
					if (!container) {
						reject(new Error("Timeline container not found"));
						return;
					}
					observer.observe(container, { childList: true, subtree: true });
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
		if (Array.isArray(options.includes) && options.includes.length > 0) {
			for (const words of options.includes) {
				querybuilder.push(words.includes(" ") ? words : words);
			}
		}

		if (Array.isArray(options.excludes) && options.excludes.length > 0) {
			for (const words of options.excludes) {
				querybuilder.push(words.includes(" ") ? `-${words}` : `-${words}`);
			}
		}
		// Handle "either" (OR group)
		if (Array.isArray(options.either) && options.either.length > 0) {
			// Only quote tokens that contain spaces or special characters
			const cleanedTokens = options.either.map((token) => {
				const trimmed = token.trim();

				// Escape internal double quotes to avoid breaking the query
				const safe = trimmed.replace(/"/g, '\\"');

				// Quote only if it contains spaces or is a multi-word phrase
				return /\s/.test(safe) ? safe : safe;
			});

			querybuilder.push(`(${cleanedTokens.join(" OR ")})`);
		}

		// Handle filters
		if (Array.isArray(options.filters) && options.filters.length > 0) {
			for (const filter of options.filters) {
				if (typeof filter === "string" && filter.trim() !== "") {
					querybuilder.push(`filter:${filter.toLowerCase().trim()}`);
				}
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
