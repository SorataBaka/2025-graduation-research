import { Request, Response, NextFunction } from "express";
import { RouteResponse } from "../types";
export default async (req: Request, res: Response, next: NextFunction) => {
	res.status(404).json({
		status: 404,
		message: "Route not found",
		code: "NOTFOUND",
		path: req.originalUrl,
	} as RouteResponse);
	next();
};
