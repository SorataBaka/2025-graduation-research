export interface Cookie {
	domain: string;
	expirationDate: float;
	hostOnly: boolean;
	httpOnly: boolean;
	name: string;
	path: string;
	sameSite: string;
	secure: boolean;
	session: boolean;
	value: string;
	id: number;
}
