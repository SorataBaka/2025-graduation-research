import mongoose from "mongoose";

const schema = new mongoose.Schema({
	time: {
		type: Date,
		required: true,
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
