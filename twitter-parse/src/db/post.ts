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
		type: Text,
		required: true,
	},
});

export default mongoose.model("posts", schema);
