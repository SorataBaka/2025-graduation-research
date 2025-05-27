import mongoose, { InferSchemaType, HydratedDocument } from "mongoose";

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
export type Post = InferSchemaType<typeof schema>;
export type PostDocument = HydratedDocument<Post>;

export default mongoose.model("posts", schema);
