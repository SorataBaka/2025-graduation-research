import mongoose from "mongoose";

const schema = new mongoose.Schema({
	smallest_date: {
		type: Date,
		required: true,
	},
	timeline_start_date: {
		type: Date,
		required: true,
	},
	started_at: {
		type: Date,
		required: true,
	},
});

export default mongoose.model("logs_database", schema);
