import { Request, Response, NextFunction } from "express";
import { ErrorResponse } from "../../..";

export default async (
	error: Error,
	req: Request,
	res: Response,
	next: NextFunction
) => {
	if (!error) {
		res.status(400).json({
			status: 400,
			message: "Invalid Request",
			code: "INVALIDREQUEST",
			error: null,
		} as ErrorResponse<null>);
		return;
	}
	res.status(400).json({
		status: 500,
		message: error.message,
		code: "INVALIDREQUEST",
		error: null,
	} as ErrorResponse<null>);
};
