import { Request, Response, NextFunction } from "express";
import { RouteResponse } from "../types";
export default (req: Request, res: Response, next: NextFunction) => {
	res.status(200).json({
		status: 200,
		message: "OK",
		code: "OK",
		path: req.originalUrl,
	} as RouteResponse);
};
