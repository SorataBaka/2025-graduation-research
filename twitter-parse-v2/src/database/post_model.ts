import mongoose from "mongoose";

const schema = new mongoose.Schema({
	tweet_id: {
		type: String,
		required: true,
		unique: true,
	},
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
		type: Number,
		required: true,
	},
	repost_count: {
		type: Number,
		required: true,
	},
	like_count: {
		type: Number,
		required: true,
	},
	view_count: {
		type: Number,
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
