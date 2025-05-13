import mongoose from "mongoose";

const schema = new mongoose.Schema({
<<<<<<< HEAD
=======
	tweet_id: {
		type: String,
		required: true,
		unique: true,
	},
>>>>>>> 5111e1b111ccf8ca4f57f11542f14fba830474c9
	time: {
		type: Date,
		required: false,
	},
	author: {
		type: String,
		required: true,
	},
	content: {
		type: String,
		required: true,
	},
	comment_count: {
		type: String,
		required: true,
	},
	repost_count: {
		type: String,
		required: true,
	},
	like_count: {
		type: String,
		required: true,
	},
	view_count: {
		type: String,
		required: true,
	},
	created_at: {
		type: Date,
		required: true,
	},
});

const model = mongoose.model("posts", schema);

export default model;

export type PostType = typeof model;
