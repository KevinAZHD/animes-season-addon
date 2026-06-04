// Enum representing the four anime seasons
export enum Season {
    WINTER = "WINTER",
    SPRING = "SPRING",
    SUMMER = "SUMMER",
    FALL = "FALL"
}

// Maps English season to Spanish season name
export const seasonToSpanish: Record<Season, string> = {
    [Season.WINTER]: "INVIERNO",
    [Season.SPRING]: "PRIMAVERA",
    [Season.SUMMER]: "VERANO",
    [Season.FALL]: "OTOÑO"
};

// Maps Spanish season name to English season
export const spanishToSeason: Record<string, Season> = {
    "INVIERNO": Season.WINTER,
    "PRIMAVERA": Season.SPRING,
    "VERANO": Season.SUMMER,
    "OTOÑO": Season.FALL,
    "invierno": Season.WINTER,
    "primavera": Season.SPRING,
    "verano": Season.SUMMER,
    "otoño": Season.FALL
};

// Converts a calendar month (0-11) to its corresponding anime season
export function monthToSeason(month: number): Season {
    if (month >= 0 && month <= 2) return Season.WINTER;
    if (month >= 3 && month <= 5) return Season.SPRING;
    if (month >= 6 && month <= 8) return Season.SUMMER;
    if (month >= 9 && month <= 11) return Season.FALL;
    throw new Error("Month must be between 0 and 11");
}

// Returns a list of seasons sorted starting from the specified first season
export function createSortedSeasonList(firstSeason: Season): Season[] {
    const list = [Season.WINTER, Season.SPRING, Season.SUMMER, Season.FALL];
    const startIndex = list.indexOf(firstSeason);
    return [...list.slice(startIndex), ...list.slice(0, startIndex)];
}

// Returns the next season name and corresponding year
export function getNextSeasonAndYear(currentSeason: Season, currentYear: number): [Season, number] {
    switch (currentSeason) {
        case Season.WINTER: return [Season.SPRING, currentYear];
        case Season.SPRING: return [Season.SUMMER, currentYear];
        case Season.SUMMER: return [Season.FALL,   currentYear];
        case Season.FALL:   return [Season.WINTER, currentYear + 1];
        default: throw new Error("Invalid season");
    }
}
