import { TitleType } from "name-to-imdb";

export enum Season {
    WINTER = "WINTER", // Dec to Feb
    SPRING = "SPRING", // Mar to May
    SUMMER = "SUMMER", // Jun to Aug
    FALL = "FALL" // Sep to Nov
}
export const seasonToSpanish: Record<Season, string> = {
    [Season.WINTER]: "INVIERNO",
    [Season.SPRING]: "PRIMAVERA",
    [Season.SUMMER]: "VERANO",
    [Season.FALL]: "OTOÑO"
};
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
export enum Sorting {
    ID = "ID",
    ID_DESC = "ID_DESC",
    TITLE_ROMAJI = "TITLE_ROMAJI",
    TITLE_ROMAJI_DESC = "TITLE_ROMAJI_DESC",
    TITLE_ENGLISH = "TITLE_ENGLISH",
    TITLE_ENGLISH_DESC = "TITLE_ENGLISH_DESC",
    TITLE_NATIVE = "TITLE_NATIVE",
    TITLE_NATIVE_DESC = "TITLE_NATIVE_DESC",
    TYPE = "TYPE",
    TYPE_DESC = "TYPE_DESC",
    FORMAT = "FORMAT",
    FORMAT_DESC = "FORMAT_DESC",
    START_DATE = "START_DATE",
    START_DATE_DESC = "START_DATE_DESC",
    END_DATE = "END_DATE",
    END_DATE_DESC = "END_DATE_DESC",
    SCORE = "SCORE",
    SCORE_DESC = "SCORE_DESC",
    POPULARITY = "POPULARITY",
    POPULARITY_DESC = "POPULARITY_DESC",
    TRENDING = "TRENDING",
    TRENDING_DESC = "TRENDING_DESC",
    EPISODES = "EPISODES",
    EPISODES_DESC = "EPISODES_DESC",
    DURATION = "DURATION",
    DURATION_DESC = "DURATION_DESC",
    STATUS = "STATUS",
    STATUS_DESC = "STATUS_DESC",
    CHAPTERS = "CHAPTERS",
    CHAPTERS_DESC = "CHAPTERS_DESC",
    VOLUMES = "VOLUMES",
    VOLUMES_DESC = "VOLUMES_DESC",
    UPDATED_AT = "UPDATED_AT",
    UPDATED_AT_DESC = "UPDATED_AT_DESC",
    SEARCH_MATCH = "SEARCH_MATCH",
    FAVOURITES = "FAVOURITES",
    FAVOURITES_DESC = ""
}

// Convert month to season matching MAL
export function monthToSeason(month: number): Season {
    if (month >= 0 && month <= 2) return Season.WINTER;  // Jan-Mar
    if (month >= 3 && month <= 5) return Season.SPRING;  // Apr-Jun
    if (month >= 6 && month <= 8) return Season.SUMMER;  // Jul-Sep
    if (month >= 9 && month <= 11) return Season.FALL;   // Oct-Dec
    throw new Error("Month must be between 0 and 11");
}

// Sort seasons list starting from firstSeason
export function createSortedSeasonList(firstSeason: Season): Season[] {
  switch (firstSeason) {
    case Season.WINTER:
      return [Season.WINTER, Season.SPRING, Season.SUMMER, Season.FALL];
    case Season.SPRING:
      return [Season.SPRING, Season.SUMMER, Season.FALL, Season.WINTER];
    case Season.SUMMER:
      return [Season.SUMMER, Season.FALL, Season.WINTER, Season.SPRING];
    case Season.FALL:
      return [Season.FALL, Season.WINTER, Season.SPRING, Season.SUMMER];
    default:
      throw new Error("Invalid season");
  }
}

// Generate GraphQL query string
export function query(year: number, season: Season, sorting: Sorting, format: TitleType = "movie"): string{
    if (year < 2000 || year > (new Date()).getFullYear() + 1) throw new Error("Year must be between 2000 and next year");
    const formatFilter = format === "movie" ? "format:MOVIE" : "format_in:[TV,TV_SHORT,OVA,SPECIAL,ONA]";
    return `query {
        Page(perPage: 50, page: 1) {
          media(seasonYear:${year}, season:${season}, sort:${sorting}, type:ANIME, ${formatFilter}) {
            id
            idMal
            popularity
            genres
            title {
              romaji
              english
            }
            tags {
              name
              isMediaSpoiler
              isGeneralSpoiler
            }
            description
            seasonYear
            bannerImage
            coverImage {
              medium
              large
              extraLarge
            }
          }
        }
      }`
}

// Get next season and year
export function getNextSeasonAndYear(currentSeason: Season, currentYear: number): [Season, number] {
    switch (currentSeason) {
        case Season.WINTER: return [Season.SPRING, currentYear];
        case Season.SPRING: return [Season.SUMMER, currentYear];
        case Season.SUMMER: return [Season.FALL,   currentYear];
        case Season.FALL:   return [Season.WINTER, currentYear + 1];
        default: throw new Error("Invalid season");
    }
}
