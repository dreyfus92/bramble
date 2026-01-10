/**
 * Shared helper utilities for the Book Club Bot.
 */

/**
 * Get current month in YYYY-MM format.
 * @example getCurrentMonth() // "2026-01"
 */
export const getCurrentMonth = (): string => {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
};

/**
 * Format month for display.
 * @example formatMonthDisplay("2026-01") // "January 2026"
 */
export const formatMonthDisplay = (month: string): string => {
	const [year, monthNum] = month.split("-");
	const monthNames = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];
	const monthName = monthNames[parseInt(monthNum, 10) - 1] || monthNum;
	return `${monthName} ${year}`;
};
