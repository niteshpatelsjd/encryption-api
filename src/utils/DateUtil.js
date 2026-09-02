function convertDateToString(date) {
    if (!date) return null;

    const d = new Date(date);

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();

    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Converts string (dd-MM-yyyy HH:mm:ss) to Date
 *
 * Example:
 * 29-07-2026 15:30:00
 */
function convertStringToDate(dateString) {

    if (!dateString) return null;

    const regex =
        /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/;

    const match = dateString.match(regex);

    if (!match) {
        throw new Error(
            "Invalid date format. Expected dd-MM-yyyy HH:mm:ss"
        );
    }

    const [
        ,
        day,
        month,
        year,
        hour,
        minute,
        second
    ] = match;

    const date = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
    );

    // Validate date (handles invalid dates like 31-02-2026)
    if (
        date.getFullYear() !== Number(year) ||
        date.getMonth() !== Number(month) - 1 ||
        date.getDate() !== Number(day)
    ) {
        throw new Error("Invalid date value.");
    }

    return date;
}

module.exports = {
    convertDateToString,
    convertStringToDate
};