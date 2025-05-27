import joi from "@hapi/joi";
const configvalidation = joi
	.object({
		// From original config
		parse_limit: joi.number(),
		scroll_delay: joi.number(),
		scroll_timeout: joi.number(),
		ratelimit_timeout: joi.number(),

		// Optional — From SearchOptions (if used in config)
		plaintext: joi.string(),
		by: joi.string(),
		replies: joi.string(),
		mentions: joi.string(),
		exact: joi.string(),
		includes: joi.array().items(joi.string()),
		excludes: joi.array().items(joi.string()),
		either: joi.array().items(joi.string()),
		filters: joi
			.array()
			.items(
				joi
					.string()
					.valid(
						"media",
						"twimg",
						"images",
						"videos",
						"periscope",
						"native_video",
						"vine",
						"consumer_video",
						"pro_video",
						"verified",
						"blue_verified",
						"follows",
						"social",
						"trusted",
						"safe",
						"news",
						"spaces",
						"replies",
						"retweets",
						"nativeretweets",
						"quote",
						"links"
					)
			),
		timeline: joi.number().valid(0, 1).default(1), // Timeline.TOP = 0, LATEST = 1
	})
	.xor("includes", "excludes", "either", "exact", "plaintext");

export default configvalidation;
