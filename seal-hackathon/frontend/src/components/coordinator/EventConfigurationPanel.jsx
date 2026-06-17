import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PublishedWithChangesRoundedIcon from "@mui/icons-material/PublishedWithChangesRounded";
import ShuffleRoundedIcon from "@mui/icons-material/ShuffleRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import ViewKanbanRoundedIcon from "@mui/icons-material/ViewKanbanRounded";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import { useSearchParams } from "react-router-dom";
import { getApiErrorMessage, http } from "../../api/http";
import HighlightPill from "../layout/HighlightPill";
import ModulePageHeader from "../layout/ModulePageHeader";
import { brand } from "../../styles/designTokens";

const CURRENT_YEAR = new Date().getFullYear();
const SEMESTER_SEQUENCE = ["Spring", "Summer", "Fall"];
const TRACK_ASSIGNMENT_MODES = [
  { value: "TEAM_SELECT", label: "Teams choose their own track" },
  { value: "SYSTEM_RANDOM", label: "System randomly assigns a track" },
];
const FINAL_RANKING_MODES = [
  { value: "RANK_BY_SCORE", label: "Rank final by score" },
  { value: "ADDITIONAL_COMPETITION", label: "Run additional final activities" },
];
const GRAND_FINAL_ELIGIBILITY_OPTIONS = [
  { value: "CHAMPION_ONLY", label: "Champion only" },
  { value: "TOP_3_EACH_SEMESTER", label: "Top 3 each semester" },
  { value: "ALL_AWARDED_TEAMS", label: "All awarded teams" },
  { value: "CUSTOM_RULE", label: "Custom rule" },
];
const GRAND_FINAL_METHOD_OPTIONS = [
  { value: "SUM_SCORES_ACROSS_SEMESTERS", label: "Sum scores across semesters" },
  { value: "ADDITIONAL_GRAND_FINAL_COMPETITION", label: "Additional grand final competition" },
];
const STATUS_OPTIONS = ["Draft", "Configured"];
const WIZARD_STEPS = [
  { key: "basic", label: "Basic Info", caption: "Name and overview", icon: InfoOutlinedIcon },
  { key: "range", label: "Semester Range", caption: "Start to end semester", icon: CalendarMonthRoundedIcon },
  { key: "dates", label: "Semester Dates", caption: "Registration and competition", icon: AutoAwesomeRoundedIcon },
  { key: "tracks", label: "Tracks", caption: "Topics per semester", icon: ViewKanbanRoundedIcon },
  { key: "assignment", label: "Track Mode", caption: "Choose or random assign", icon: ShuffleRoundedIcon },
  { key: "rounds", label: "Rounds", caption: "Stages and finals", icon: FlagRoundedIcon },
  { key: "promotion", label: "Promotion Rules", caption: "Top N per track", icon: TimelineRoundedIcon },
  { key: "awards", label: "Final Mode & Awards", caption: "Season outcomes", icon: StarRoundedIcon },
  { key: "grand-final", label: "Grand Final", caption: "Optional overall stage", icon: WorkspacePremiumRoundedIcon },
  { key: "publish", label: "Publish", caption: "Review and save", icon: PublishedWithChangesRoundedIcon },
];
const EVENT_WIZARD_DRAFT_STORAGE_PREFIX = "seal-event-config-draft:";

function getEventWizardDraftStorageKey(eventId = "new") {
  return `${EVENT_WIZARD_DRAFT_STORAGE_PREFIX}${eventId}`;
}

function uid(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function semesterIndex(season) {
  const index = SEMESTER_SEQUENCE.indexOf(season);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function semesterLabel(ref) {
  return `${ref.season} ${ref.year}`;
}

function semesterBounds(ref) {
  if (ref.season === "Spring") {
    return {
      start: `${ref.year}-01-01`,
      end: `${ref.year}-04-30`,
      hint: "Spring: 01/01 to 30/04",
    };
  }
  if (ref.season === "Summer") {
    return {
      start: `${ref.year}-05-01`,
      end: `${ref.year}-08-31`,
      hint: "Summer: 01/05 to 31/08",
    };
  }
  return {
    start: `${ref.year}-09-01`,
    end: `${ref.year}-12-31`,
    hint: "Fall: 01/09 to 31/12",
  };
}

function parseIsoDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return { year, month, day };
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function buildIsoDate(year, month, day) {
  if (!year || !month || !day) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatRangeLabel(minDate, maxDate) {
  if (!minDate || !maxDate) return "";
  const start = parseIsoDate(minDate);
  const end = parseIsoDate(maxDate);
  if (!start || !end) return "";
  return `${String(start.day).padStart(2, "0")}/${String(start.month).padStart(2, "0")}/${start.year} - ${String(end.day).padStart(2, "0")}/${String(end.month).padStart(2, "0")}/${end.year}`;
}

function getYearOptions(minDate, maxDate) {
  const start = parseIsoDate(minDate);
  const end = parseIsoDate(maxDate);
  if (!start || !end) return [];
  const years = [];
  for (let year = start.year; year <= end.year; year += 1) {
    years.push(year);
  }
  return years;
}

function getMonthOptions(year, minDate, maxDate) {
  const start = parseIsoDate(minDate);
  const end = parseIsoDate(maxDate);
  if (!start || !end || !year) return [];
  const minMonth = year === start.year ? start.month : 1;
  const maxMonth = year === end.year ? end.month : 12;
  return Array.from({ length: maxMonth - minMonth + 1 }, (_, index) => minMonth + index);
}

function getDayOptions(year, month, minDate, maxDate) {
  const start = parseIsoDate(minDate);
  const end = parseIsoDate(maxDate);
  if (!start || !end || !year || !month) return [];
  const minDay = year === start.year && month === start.month ? start.day : 1;
  const maxDay = year === end.year && month === end.month ? end.day : daysInMonth(year, month);
  return Array.from({ length: maxDay - minDay + 1 }, (_, index) => minDay + index);
}

function monthLabel(monthNumber) {
  return new Date(2000, monthNumber - 1, 1).toLocaleString("en-US", { month: "long" });
}

function getSeasonDateBounds(season) {
  return semesterBounds({ season: season.season, year: season.year });
}

function getCompetitionWindowLabel(season) {
  if (season.competitionStartDate && season.competitionEndDate) {
    return formatRangeLabel(season.competitionStartDate, season.competitionEndDate);
  }
  const bounds = getSeasonDateBounds(season);
  return formatRangeLabel(bounds.start, bounds.end);
}

function getRoundDateBounds(season) {
  if (season.competitionStartDate && season.competitionEndDate) {
    return {
      start: season.competitionStartDate,
      end: season.competitionEndDate,
      source: "competition",
    };
  }
  const bounds = getSeasonDateBounds(season);
  return {
    start: bounds.start,
    end: bounds.end,
    source: "semester",
  };
}

function getSeasonAccent(seasonName) {
  if (seasonName === "Spring") {
    return {
      border: "#6BCB77",
      soft: "#F3FFF4",
      chipBg: "#E9FAEC",
      chipText: "#2F8F46",
    };
  }
  if (seasonName === "Summer") {
    return {
      border: "#FDB515",
      soft: "#FFF9E8",
      chipBg: "#FFF1C7",
      chipText: "#B06F00",
    };
  }
  return {
    border: "#1677FF",
    soft: "#F3F8FF",
    chipBg: "#E7F0FF",
    chipText: "#1657B8",
  };
}

function createSemesterOptions() {
  const options = [];
  for (let year = CURRENT_YEAR - 1; year <= CURRENT_YEAR + 4; year += 1) {
    for (const season of SEMESTER_SEQUENCE) {
      options.push({ season, year, label: `${season} ${year}` });
    }
  }
  return options;
}

function parseSemesterLabel(value) {
  if (!value) return null;
  const [season, year] = String(value).trim().split(/\s+/);
  const parsedYear = Number(year);
  if (!SEMESTER_SEQUENCE.includes(season) || !Number.isInteger(parsedYear)) {
    return null;
  }
  return { season, year: parsedYear };
}

function compareSemesterRefs(left, right) {
  if (left.year !== right.year) return left.year - right.year;
  return semesterIndex(left.season) - semesterIndex(right.season);
}

function getConsecutiveSemesterRange(startLabel, endLabel) {
  const start = parseSemesterLabel(startLabel);
  const end = parseSemesterLabel(endLabel);
  if (!start || !end) return [];
  if (compareSemesterRefs(start, end) > 0) return [];

  const semesters = [];
  let current = { ...start };
  while (compareSemesterRefs(current, end) <= 0) {
    semesters.push({ ...current });
    const currentIndex = semesterIndex(current.season);
    if (currentIndex === SEMESTER_SEQUENCE.length - 1) {
      current = { season: SEMESTER_SEQUENCE[0], year: current.year + 1 };
    } else {
      current = { season: SEMESTER_SEQUENCE[currentIndex + 1], year: current.year };
    }
  }
  return semesters;
}

function createTrackDraft(name = "", description = "") {
  return { trackKey: uid("track"), name, description };
}

function createRoundDraft(order, roundName, finalRound = false) {
  return {
    roundKey: uid("round"),
    roundName: roundName || (finalRound ? "Final" : `Round ${order}`),
    roundOrder: order,
    startDate: "",
    endDate: "",
    finalRound,
  };
}

function createPromotionRule(trackKey, fromRoundKey, toRoundKey, topN = 1) {
  return { trackKey, fromRoundKey, toRoundKey, topN };
}

function createAwardDraft(name = "Champion", quantity = 1) {
  return { awardName: name, quantity };
}

function createSemesterDraft(ref) {
  const qualifier = createRoundDraft(1, "Qualifier 1", false);
  const final = createRoundDraft(2, "Final", true);
  const defaultTrack = createTrackDraft("AI", "Artificial intelligence and data products.");
  return syncSemesterDraft({
    season: ref.season,
    year: ref.year,
    registrationStartDate: "",
    registrationEndDate: "",
    competitionStartDate: "",
    competitionEndDate: "",
    trackSelectionMode: "TEAM_SELECT",
    tracks: [defaultTrack],
    rounds: [qualifier, final],
    promotionRules: [createPromotionRule(defaultTrack.trackKey, qualifier.roundKey, final.roundKey, 5)],
    finalRankingMode: "RANK_BY_SCORE",
    additionalFinalActivities: [],
    awards: [createAwardDraft("Champion", 1)],
  });
}

function syncSemesterDraft(seasonDraft) {
  const tracks = (seasonDraft.tracks?.length ? seasonDraft.tracks : [createTrackDraft("")]).map((track, index) => ({
    trackKey: track.trackKey || uid(`track-${index + 1}`),
    name: track.name || "",
    description: track.description || "",
  }));

  let rounds = [...(seasonDraft.rounds?.length ? seasonDraft.rounds : [createRoundDraft(1, "Qualifier 1"), createRoundDraft(2, "Final", true)])]
    .sort((left, right) => Number(left.roundOrder || 0) - Number(right.roundOrder || 0))
    .map((round, index) => ({
      roundKey: round.roundKey || uid(`round-${index + 1}`),
      roundName: round.roundName || (index === 0 ? "Qualifier 1" : `Round ${index + 1}`),
      roundOrder: index + 1,
      startDate: round.startDate || "",
      endDate: round.endDate || "",
      finalRound: Boolean(round.finalRound),
    }));

  if (!rounds.some((round) => round.finalRound)) {
    rounds[rounds.length - 1] = { ...rounds[rounds.length - 1], finalRound: true };
  }

  rounds = rounds.map((round, index) => ({
    ...round,
    finalRound: index === rounds.length - 1 ? true : Boolean(round.finalRound && index === rounds.length - 1),
  }));

  const roundMap = new Map(rounds.map((round) => [round.roundKey, round]));
  const defaultNextRoundKeyByFrom = new Map(
    rounds.slice(0, -1).map((round, index) => [round.roundKey, rounds[index + 1].roundKey])
  );
  const existingRuleMap = new Map(
    (seasonDraft.promotionRules || []).map((rule) => [`${rule.trackKey}::${rule.fromRoundKey}`, rule])
  );

  const promotionRules = [];
  for (const track of tracks) {
    for (const round of rounds.slice(0, -1)) {
      const existingRule = existingRuleMap.get(`${track.trackKey}::${round.roundKey}`);
      const nextRoundKey = defaultNextRoundKeyByFrom.get(round.roundKey);
      promotionRules.push({
        trackKey: track.trackKey,
        fromRoundKey: round.roundKey,
        toRoundKey: nextRoundKey,
        topN: Math.max(1, Number(existingRule?.topN || 1)),
      });
    }
  }

  return {
    season: seasonDraft.season,
    year: seasonDraft.year,
    registrationStartDate: seasonDraft.registrationStartDate || "",
    registrationEndDate: seasonDraft.registrationEndDate || "",
    competitionStartDate: seasonDraft.competitionStartDate || "",
    competitionEndDate: seasonDraft.competitionEndDate || "",
    trackSelectionMode: seasonDraft.trackSelectionMode || "TEAM_SELECT",
    tracks,
    rounds,
    promotionRules,
    finalRankingMode: seasonDraft.finalRankingMode || "RANK_BY_SCORE",
    additionalFinalActivities: (seasonDraft.additionalFinalActivities || []).filter(Boolean),
    awards: (seasonDraft.awards?.length ? seasonDraft.awards : [createAwardDraft("Champion", 1)]).map((award) => ({
      awardName: award.awardName || "",
      quantity: Math.max(1, Number(award.quantity || 1)),
    })),
  };
}

function syncWizardDraft(draft) {
  const generatedSemesters = getConsecutiveSemesterRange(draft.event.startSemester, draft.event.endSemester);
  const existingByLabel = new Map(
    (draft.configuration.seasons || []).map((season) => [semesterLabel(season), season])
  );
  const seasons = generatedSemesters.map((ref) => syncSemesterDraft(existingByLabel.get(semesterLabel(ref)) || createSemesterDraft(ref)));

  return {
    event: {
      name: draft.event.name || "",
      description: draft.event.description || "",
      startSemester: draft.event.startSemester || "",
      endSemester: draft.event.endSemester || "",
      status: draft.event.status || "Draft",
    },
    configuration: {
      startSemester: draft.event.startSemester || "",
      endSemester: draft.event.endSemester || "",
      seasons,
      overallGrandFinalEnabled: Boolean(draft.configuration.overallGrandFinalEnabled),
      overallGrandFinalStartDate: draft.configuration.overallGrandFinalStartDate || "",
      overallGrandFinalEndDate: draft.configuration.overallGrandFinalEndDate || "",
      overallGrandFinalEligibility: draft.configuration.overallGrandFinalEligibility || "CHAMPION_ONLY",
      overallGrandFinalMethod: draft.configuration.overallGrandFinalMethod || "SUM_SCORES_ACROSS_SEMESTERS",
      overallAdditionalActivities: (draft.configuration.overallAdditionalActivities || []).filter(Boolean),
      overallAwards: (draft.configuration.overallAwards?.length ? draft.configuration.overallAwards : [createAwardDraft("Grand Champion", 1)]).map((award) => ({
        awardName: award.awardName || "",
        quantity: Math.max(1, Number(award.quantity || 1)),
      })),
    },
  };
}

function createEmptyWizardDraft() {
  const defaultStart = `Spring ${CURRENT_YEAR}`;
  return syncWizardDraft({
    event: {
      name: "",
      description: "",
      startSemester: defaultStart,
      endSemester: defaultStart,
      status: "Draft",
    },
    configuration: {
      startSemester: defaultStart,
      endSemester: defaultStart,
      seasons: [],
      overallGrandFinalEnabled: false,
      overallGrandFinalStartDate: "",
      overallGrandFinalEndDate: "",
      overallGrandFinalEligibility: "CHAMPION_ONLY",
      overallGrandFinalMethod: "SUM_SCORES_ACROSS_SEMESTERS",
      overallAdditionalActivities: [],
      overallAwards: [createAwardDraft("Grand Champion", 1)],
    },
  });
}

function deriveDraftFromEvent(event) {
  const configuration = event.configuration || {};
  const seasons = (configuration.seasons || []).map((season) => syncSemesterDraft({
    ...season,
    additionalFinalActivities: season.additionalFinalActivities || [],
  }));
  const startSemester = configuration.startSemester || (seasons[0] ? semesterLabel(seasons[0]) : `Spring ${event.year || CURRENT_YEAR}`);
  const endSemester = configuration.endSemester || (seasons[seasons.length - 1] ? semesterLabel(seasons[seasons.length - 1]) : startSemester);

  return syncWizardDraft({
    event: {
      name: event.name || "",
      description: event.description || "",
      startSemester,
      endSemester,
      status: event.status || "Draft",
    },
    configuration: {
      startSemester,
      endSemester,
      seasons,
      overallGrandFinalEnabled: Boolean(configuration.overallGrandFinalEnabled),
      overallGrandFinalStartDate: configuration.overallGrandFinalStartDate || "",
      overallGrandFinalEndDate: configuration.overallGrandFinalEndDate || "",
      overallGrandFinalEligibility: configuration.overallGrandFinalEligibility || "CHAMPION_ONLY",
      overallGrandFinalMethod: configuration.overallGrandFinalMethod || "SUM_SCORES_ACROSS_SEMESTERS",
      overallAdditionalActivities: configuration.overallAdditionalActivities || [],
      overallAwards: configuration.overallAwards || [createAwardDraft("Grand Champion", 1)],
    },
  });
}

function buildPayload(draft, statusOverride = null) {
  const synced = syncWizardDraft(draft);
  const seasons = synced.configuration.seasons;
  const firstSeason = seasons[0];
  const lastSeason = seasons.at(-1);
  const compactSeasonSummary = Array.from(new Set(seasons.map((season) => season.season))).join("+") || "Spring";
  const fallbackStartDate = firstSeason
    ? semesterBounds({ season: firstSeason.season, year: firstSeason.year }).start
    : "";
  const fallbackEndDate = lastSeason
    ? semesterBounds({ season: lastSeason.season, year: lastSeason.year }).end
    : "";
  const overallStartDate = seasons
    .map((season) => season.registrationStartDate)
    .filter(Boolean)
    .sort()[0] || fallbackStartDate;
  const overallEndDate = [...seasons]
    .map((season) => season.competitionEndDate)
    .filter(Boolean)
    .sort()
    .at(-1) || fallbackEndDate;

  return {
    event: {
      name: synced.event.name.trim(),
      season: compactSeasonSummary,
      year: Number(firstSeason?.year || CURRENT_YEAR),
      startDate: overallStartDate,
      endDate: overallEndDate,
      status: statusOverride || synced.event.status || "Draft",
      description: synced.event.description?.trim() || "",
    },
    configuration: {
      startSemester: synced.configuration.startSemester,
      endSemester: synced.configuration.endSemester,
      seasons: seasons.map((season) => ({
        season: season.season,
        year: Number(season.year),
        registrationStartDate: season.registrationStartDate,
        registrationEndDate: season.registrationEndDate,
        competitionStartDate: season.competitionStartDate,
        competitionEndDate: season.competitionEndDate,
        trackSelectionMode: season.trackSelectionMode,
        tracks: season.tracks.map((track) => ({
          trackKey: track.trackKey,
          name: track.name.trim(),
          description: track.description?.trim() || "",
        })),
        rounds: season.rounds.map((round, index) => ({
          roundKey: round.roundKey,
          roundName: round.roundName.trim(),
          roundOrder: index + 1,
          startDate: round.startDate,
          endDate: round.endDate,
          finalRound: Boolean(round.finalRound),
        })),
        promotionRules: season.promotionRules.map((rule) => ({
          trackKey: rule.trackKey,
          fromRoundKey: rule.fromRoundKey,
          toRoundKey: rule.toRoundKey,
          topN: Number(rule.topN),
        })),
        finalRankingMode: season.finalRankingMode,
        additionalFinalActivities: season.finalRankingMode === "ADDITIONAL_COMPETITION" ? season.additionalFinalActivities : [],
        awards: season.awards.map((award) => ({
          awardName: award.awardName.trim(),
          quantity: Number(award.quantity),
        })),
      })),
      overallGrandFinalEnabled: synced.configuration.overallGrandFinalEnabled,
      overallGrandFinalStartDate: synced.configuration.overallGrandFinalEnabled ? synced.configuration.overallGrandFinalStartDate || null : null,
      overallGrandFinalEndDate: synced.configuration.overallGrandFinalEnabled ? synced.configuration.overallGrandFinalEndDate || null : null,
      overallGrandFinalEligibility: synced.configuration.overallGrandFinalEnabled ? synced.configuration.overallGrandFinalEligibility : null,
      overallGrandFinalMethod: synced.configuration.overallGrandFinalEnabled ? synced.configuration.overallGrandFinalMethod : null,
      overallAdditionalActivities:
        synced.configuration.overallGrandFinalEnabled && synced.configuration.overallGrandFinalMethod === "ADDITIONAL_GRAND_FINAL_COMPETITION"
          ? synced.configuration.overallAdditionalActivities
          : [],
      overallAwards: synced.configuration.overallGrandFinalEnabled
        ? synced.configuration.overallAwards.map((award) => ({
            awardName: award.awardName.trim(),
            quantity: Number(award.quantity),
          }))
        : [],
    },
  };
}

function buildDraftPayload(draft) {
  const parsedStart = parseSemesterLabel(draft.event.startSemester);
  const parsedEnd = parseSemesterLabel(draft.event.endSemester);
  const fallbackSemester = parsedStart || parsedEnd || { season: "Spring", year: CURRENT_YEAR };
  const normalizedStart = parsedStart || fallbackSemester;
  const normalizedEnd = parsedEnd && compareSemesterRefs(normalizedStart, parsedEnd) <= 0
    ? parsedEnd
    : normalizedStart;
  const semesterRange = getConsecutiveSemesterRange(
    semesterLabel(normalizedStart),
    semesterLabel(normalizedEnd)
  );
  const resolvedSemesters = semesterRange.length ? semesterRange : [normalizedStart];
  const seasonDraftMap = new Map(
    (draft.configuration.seasons || []).map((season) => [semesterLabel(season), season])
  );
  const seasons = resolvedSemesters.map((ref) => {
    const existing = seasonDraftMap.get(semesterLabel(ref));
    return {
      season: ref.season,
      year: Number(ref.year),
      registrationStartDate: existing?.registrationStartDate || null,
      registrationEndDate: existing?.registrationEndDate || null,
      competitionStartDate: existing?.competitionStartDate || null,
      competitionEndDate: existing?.competitionEndDate || null,
      trackSelectionMode: existing?.trackSelectionMode || "TEAM_SELECT",
      tracks: (existing?.tracks || []).map((track) => ({
        trackKey: track.trackKey,
        name: track.name?.trim() || "",
        description: track.description?.trim() || "",
      })),
      rounds: (existing?.rounds || []).map((round, index) => ({
        roundKey: round.roundKey,
        roundName: round.roundName?.trim() || "",
        roundOrder: Number(round.roundOrder || index + 1),
        startDate: round.startDate || null,
        endDate: round.endDate || null,
        finalRound: Boolean(round.finalRound),
      })),
      promotionRules: (existing?.promotionRules || []).map((rule) => ({
        trackKey: rule.trackKey,
        fromRoundKey: rule.fromRoundKey,
        toRoundKey: rule.toRoundKey,
        topN: Number(rule.topN || 1),
      })),
      finalRankingMode: existing?.finalRankingMode || "RANK_BY_SCORE",
      additionalFinalActivities: existing?.additionalFinalActivities || [],
      awards: (existing?.awards || []).map((award) => ({
        awardName: award.awardName?.trim() || "",
        quantity: Number(award.quantity || 1),
      })),
    };
  });
  const seasonSummary = Array.from(new Set(seasons.map((season) => season.season))).join("+") || "Spring";
  const startBound = semesterBounds(resolvedSemesters[0]).start;
  const endBound = semesterBounds(resolvedSemesters.at(-1)).end;

  return {
    event: {
      name: draft.event.name.trim() || "Untitled Draft Event",
      season: seasonSummary,
      year: Number(resolvedSemesters[0].year || CURRENT_YEAR),
      startDate: startBound,
      endDate: endBound,
      status: "Draft",
      description: draft.event.description?.trim() || "",
    },
    configuration: {
      startSemester: semesterLabel(resolvedSemesters[0]),
      endSemester: semesterLabel(resolvedSemesters.at(-1)),
      seasons,
      overallGrandFinalEnabled: Boolean(draft.configuration.overallGrandFinalEnabled),
      overallGrandFinalStartDate: draft.configuration.overallGrandFinalEnabled ? draft.configuration.overallGrandFinalStartDate || null : null,
      overallGrandFinalEndDate: draft.configuration.overallGrandFinalEnabled ? draft.configuration.overallGrandFinalEndDate || null : null,
      overallGrandFinalEligibility: draft.configuration.overallGrandFinalEligibility || null,
      overallGrandFinalMethod: draft.configuration.overallGrandFinalMethod || null,
      overallAdditionalActivities: draft.configuration.overallAdditionalActivities || [],
      overallAwards: (draft.configuration.overallAwards || []).map((award) => ({
        awardName: award.awardName?.trim() || "",
        quantity: Number(award.quantity || 1),
      })),
    },
  };
}

function getFinalEligibleTeamCount(season) {
  const finalRound = season.rounds.find((round) => round.finalRound);
  if (!finalRound) return null;
  const total = season.promotionRules
    .filter((rule) => rule.toRoundKey === finalRound.roundKey)
    .reduce((sum, rule) => sum + Number(rule.topN || 0), 0);
  return total > 0 ? total : null;
}

function getDraftSaveErrorMessage(error) {
  const responseData = error?.response?.data;
  if (responseData?.message === "Validation failed" && responseData?.data && typeof responseData.data === "object") {
    const firstMessage = Object.values(responseData.data).find((value) => typeof value === "string" && value.trim());
    if (firstMessage) {
      return firstMessage;
    }
  }
  return getApiErrorMessage(error, "Failed to save draft.");
}

function normalizeEventStatus(status) {
  return String(status || "").trim().toUpperCase().replace(/[\s_]/g, "");
}

function getOrderedSeasonDates(seasons, fieldName) {
  return (seasons || [])
    .map((season) => season?.[fieldName] || "")
    .filter(Boolean)
    .sort();
}

function getGrandFinalDateBounds(draft) {
  const seasons = draft.configuration?.seasons || [];
  if (!seasons.length) {
    const today = buildIsoDate(new Date().getFullYear(), 1, 1);
    return { minDate: today, maxDate: today, hint: "" };
  }

  const lastSeason = seasons.at(-1);
  const lastSeasonBounds = semesterBounds({ season: lastSeason.season, year: lastSeason.year });
  const competitionEndDates = getOrderedSeasonDates(seasons, "competitionEndDate");
  const latestCompetitionEnd = competitionEndDates.at(-1) || lastSeasonBounds.start;

  return {
    minDate: latestCompetitionEnd,
    maxDate: lastSeasonBounds.end,
    hint: `Allowed: ${formatRangeLabel(latestCompetitionEnd, lastSeasonBounds.end)}`,
  };
}

function getEventEditPolicy(mode, draft, todayIso) {
  if (mode !== "edit") {
    return {
      level: "full",
      canEditName: true,
      canEditDescription: true,
      canEditSemesterRange: true,
      canEditSemesterDates: true,
      canEditTracks: true,
      canEditTrackMode: true,
      canEditRounds: true,
      canEditPromotion: true,
      canEditAwards: true,
      canEditGrandFinal: true,
      canSubmitChanges: true,
      notice: "",
    };
  }

  const normalizedStatus = normalizeEventStatus(draft?.event?.status);
  if (normalizedStatus === "DRAFT") {
    return {
      level: "full",
      canEditName: true,
      canEditDescription: true,
      canEditSemesterRange: true,
      canEditSemesterDates: true,
      canEditTracks: true,
      canEditTrackMode: true,
      canEditRounds: true,
      canEditPromotion: true,
      canEditAwards: true,
      canEditGrandFinal: true,
      canSubmitChanges: true,
      notice: "Draft events are fully editable until they are published.",
    };
  }

  if (["RESULTPUBLISHED", "CLOSED", "CANCELLED"].includes(normalizedStatus)) {
    return {
      level: "locked",
      canEditName: false,
      canEditDescription: false,
      canEditSemesterRange: false,
      canEditSemesterDates: false,
      canEditTracks: false,
      canEditTrackMode: false,
      canEditRounds: false,
      canEditPromotion: false,
      canEditAwards: false,
      canEditGrandFinal: false,
      canSubmitChanges: false,
      notice: "This event is now view-only. Configuration can still be reviewed, but editing is locked.",
    };
  }

  const seasons = draft?.configuration?.seasons || [];
  const registrationStartDates = getOrderedSeasonDates(seasons, "registrationStartDate");
  const competitionEndDates = getOrderedSeasonDates(seasons, "competitionEndDate");
  const firstRegistrationStart = registrationStartDates.at(0) || "";
  const lastCompetitionEnd = competitionEndDates.at(-1) || "";

  const registrationOpened = Boolean(firstRegistrationStart) && todayIso >= firstRegistrationStart;
  const lastSemesterStillRunning = !lastCompetitionEnd || todayIso <= lastCompetitionEnd;

  if (!registrationOpened) {
    return {
      level: "full",
      canEditName: true,
      canEditDescription: true,
      canEditSemesterRange: true,
      canEditSemesterDates: true,
      canEditTracks: true,
      canEditTrackMode: true,
      canEditRounds: true,
      canEditPromotion: true,
      canEditAwards: true,
      canEditGrandFinal: true,
      canSubmitChanges: true,
      notice: "Registration has not opened yet, so this published event is still fully editable.",
    };
  }

  if (["CONFIGURED", "REGISTRATIONOPEN", "ONGOING", "SCORING"].includes(normalizedStatus)) {
    return {
      level: "active",
      canEditName: false,
      canEditDescription: true,
      canEditSemesterRange: false,
      canEditSemesterDates: false,
      canEditTracks: false,
      canEditTrackMode: false,
      canEditRounds: true,
      canEditPromotion: true,
      canEditAwards: false,
      canEditGrandFinal: lastSemesterStillRunning,
      canSubmitChanges: true,
      notice: lastSemesterStillRunning
        ? "Registration is already open. Semester range, semester dates, tracks, and season awards are locked. You can still update round timing, promotion rules, and grand final settings before the last semester finishes."
        : "Registration is already open. Only round timing and promotion rules remain editable. Grand final settings are locked after the last semester deadline passes.",
    };
  }

  return {
    level: "locked",
    canEditName: false,
    canEditDescription: false,
    canEditSemesterRange: false,
    canEditSemesterDates: false,
    canEditTracks: false,
    canEditTrackMode: false,
    canEditRounds: false,
    canEditPromotion: false,
    canEditAwards: false,
    canEditGrandFinal: false,
    canSubmitChanges: false,
    notice: "This event status is view-only. You can review the configuration, but editing is locked.",
  };
}

function getEditableStepKeys(editPolicy) {
  return new Set(
    [
      editPolicy.canEditName || editPolicy.canEditDescription ? "basic" : null,
      editPolicy.canEditSemesterRange ? "range" : null,
      editPolicy.canEditSemesterDates ? "dates" : null,
      editPolicy.canEditTracks ? "tracks" : null,
      editPolicy.canEditTrackMode ? "assignment" : null,
      editPolicy.canEditRounds ? "rounds" : null,
      editPolicy.canEditPromotion ? "promotion" : null,
      editPolicy.canEditAwards ? "awards" : null,
      editPolicy.canEditGrandFinal ? "grand-final" : null,
      editPolicy.canSubmitChanges ? "publish" : null,
    ].filter(Boolean)
  );
}

function getMaxAccessibleWizardStep(draft) {
  const entries = validateWizard(draft);
  const firstBlockedIndex = WIZARD_STEPS.findIndex((step) => entries.some((entry) => entry.step === step.key));
  return firstBlockedIndex === -1 ? WIZARD_STEPS.length - 1 : firstBlockedIndex;
}

function readStoredWizardDraft(storageKey) {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.draft) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function validateWizard(draft) {
  const synced = syncWizardDraft(draft);
  const entries = [];
  const push = (step, message) => entries.push({ step, message });

  if (!synced.event.name.trim()) {
    push("basic", "Event name is required.");
  }

  const generatedSemesters = getConsecutiveSemesterRange(synced.event.startSemester, synced.event.endSemester);
  if (!synced.event.startSemester || !synced.event.endSemester) {
    push("range", "Select both a start semester and an end semester.");
  } else if (!generatedSemesters.length) {
    push("range", "End semester must not be before start semester.");
  }

  synced.configuration.seasons.forEach((season) => {
    const ref = { season: season.season, year: season.year };
    const bounds = semesterBounds(ref);
    const label = semesterLabel(ref);

    const dateFields = [
      ["Registration start date", season.registrationStartDate],
      ["Registration end date", season.registrationEndDate],
      ["Competition start date", season.competitionStartDate],
      ["Competition end date", season.competitionEndDate],
    ];
    dateFields.forEach(([fieldLabel, value]) => {
      if (!value) {
        push("dates", `${label}: ${fieldLabel} is required.`);
      } else if (value < bounds.start || value > bounds.end) {
        push("dates", `${label}: ${fieldLabel} must stay inside ${bounds.hint}.`);
      }
    });
    if (season.registrationStartDate && season.registrationEndDate && season.registrationStartDate > season.registrationEndDate) {
      push("dates", `${label}: registration start date must be before or equal to registration end date.`);
    }
    if (season.registrationEndDate && season.competitionStartDate && season.registrationEndDate > season.competitionStartDate) {
      push("dates", `${label}: registration end date must be before or equal to competition start date.`);
    }
    if (season.competitionStartDate && season.competitionEndDate && season.competitionStartDate > season.competitionEndDate) {
      push("dates", `${label}: competition start date must be before or equal to competition end date.`);
    }

    if (!season.tracks.length) {
      push("tracks", `${label}: add at least one track.`);
    }
    const trackNames = new Set();
    season.tracks.forEach((track, index) => {
      const normalized = track.name.trim().toLowerCase();
      if (!track.name.trim()) {
        push("tracks", `${label}: Track ${index + 1} needs a name.`);
      } else if (trackNames.has(normalized)) {
        push("tracks", `${label}: track names must be unique.`);
      }
      trackNames.add(normalized);
    });

    if (!TRACK_ASSIGNMENT_MODES.some((option) => option.value === season.trackSelectionMode)) {
      push("assignment", `${label}: choose a valid track assignment mode.`);
    }

    if (!season.rounds.length) {
      push("rounds", `${label}: add at least one round.`);
    }
    const finalRounds = season.rounds.filter((round) => round.finalRound);
    if (finalRounds.length !== 1) {
      push("rounds", `${label}: there must be exactly one final round.`);
    }
    season.rounds.forEach((round, index) => {
      if (!round.roundName.trim()) {
        push("rounds", `${label}: Round ${index + 1} needs a name.`);
      }
      if (!round.startDate || !round.endDate) {
        push("rounds", `${label}: ${round.roundName || `Round ${index + 1}`} needs both start and end date.`);
      }
      if (round.startDate && round.endDate && round.startDate > round.endDate) {
        push("rounds", `${label}: ${round.roundName || `Round ${index + 1}`} start date must be before or equal to end date.`);
      }
      if (round.startDate && season.competitionStartDate && round.startDate < season.competitionStartDate) {
        push("rounds", `${label}: ${round.roundName || `Round ${index + 1}`} must stay inside the semester competition range.`);
      }
      if (round.endDate && season.competitionEndDate && round.endDate > season.competitionEndDate) {
        push("rounds", `${label}: ${round.roundName || `Round ${index + 1}`} must stay inside the semester competition range.`);
      }
      if (round.finalRound && index !== season.rounds.length - 1) {
        push("rounds", `${label}: the final round must be the last round by order.`);
      }

      if (index > 0) {
        const previousRound = season.rounds[index - 1];
        if (
          previousRound?.endDate &&
          round.startDate &&
          round.startDate <= previousRound.endDate
        ) {
          push("rounds", `${label}: ${round.roundName || `Round ${index + 1}`} must start after ${previousRound.roundName || `Round ${index}` } ends.`);
        }
        if (
          previousRound?.endDate &&
          round.endDate &&
          round.endDate <= previousRound.endDate
        ) {
          push("rounds", `${label}: ${round.roundName || `Round ${index + 1}`} must end after ${previousRound.roundName || `Round ${index}` } ends.`);
        }
      }
    });

    const roundMap = new Map(season.rounds.map((round) => [round.roundKey, round]));
    season.tracks.forEach((track) => {
      season.rounds.filter((round) => !round.finalRound).forEach((round) => {
        const matchingRules = season.promotionRules.filter((rule) => rule.trackKey === track.trackKey && rule.fromRoundKey === round.roundKey);
        if (matchingRules.length !== 1) {
          push("promotion", `${label}: define exactly one promotion rule for ${track.name || "a track"} from ${round.roundName}.`);
          return;
        }
        const rule = matchingRules[0];
        const toRound = roundMap.get(rule.toRoundKey);
        if (!toRound) {
          push("promotion", `${label}: promotion rule from ${round.roundName} points to an unknown round.`);
        } else if (toRound.roundOrder <= round.roundOrder) {
          push("promotion", `${label}: promotion rule must go from an earlier round to a later round.`);
        } else if (toRound.roundOrder !== round.roundOrder + 1) {
          push("promotion", `${label}: promotion rule must point to the next round in sequence.`);
        }
        if (Number(rule.topN) < 1) {
          push("promotion", `${label}: Top N must be greater than 0.`);
        }
      });
    });

    if (!FINAL_RANKING_MODES.some((option) => option.value === season.finalRankingMode)) {
      push("awards", `${label}: choose a semester final ranking mode.`);
    }
    if (season.finalRankingMode === "ADDITIONAL_COMPETITION" && !season.additionalFinalActivities.length) {
      push("awards", `${label}: add at least one additional final activity.`);
    }
    if (!season.awards.length) {
      push("awards", `${label}: add at least one award.`);
    }
    season.awards.forEach((award, index) => {
      if (!award.awardName.trim()) {
        push("awards", `${label}: Award ${index + 1} needs a name.`);
      }
      if (Number(award.quantity) < 1) {
        push("awards", `${label}: award quantity must be greater than 0.`);
      }
    });
    const eligibleFinalTeams = getFinalEligibleTeamCount(season);
    if (eligibleFinalTeams != null) {
      const totalAwardQuantity = season.awards.reduce((sum, award) => sum + Number(award.quantity || 0), 0);
      if (totalAwardQuantity > eligibleFinalTeams) {
        push("awards", `${label}: total award quantity should not exceed the number of eligible final teams.`);
      }
    }
  });

  if (synced.configuration.overallGrandFinalEnabled) {
    const grandFinalBounds = getGrandFinalDateBounds(synced);
    if (!GRAND_FINAL_ELIGIBILITY_OPTIONS.some((option) => option.value === synced.configuration.overallGrandFinalEligibility)) {
      push("grand-final", "Choose a valid grand final eligibility mode.");
    }
    if (!GRAND_FINAL_METHOD_OPTIONS.some((option) => option.value === synced.configuration.overallGrandFinalMethod)) {
      push("grand-final", "Choose a valid grand final ranking method.");
    }
    if (
      synced.configuration.overallGrandFinalMethod === "ADDITIONAL_GRAND_FINAL_COMPETITION"
      && !synced.configuration.overallAdditionalActivities.length
    ) {
      push("grand-final", "Add at least one additional grand final activity.");
    }
    if (!synced.configuration.overallGrandFinalStartDate || !synced.configuration.overallGrandFinalEndDate) {
      push("grand-final", "Grand final needs both a start date and an end date.");
    } else {
      if (synced.configuration.overallGrandFinalStartDate > synced.configuration.overallGrandFinalEndDate) {
        push("grand-final", "Grand final start date must be before or equal to the grand final end date.");
      }
      if (
        synced.configuration.overallGrandFinalStartDate < grandFinalBounds.minDate
        || synced.configuration.overallGrandFinalStartDate > grandFinalBounds.maxDate
      ) {
        push("grand-final", "Grand final start date must stay inside the final semester window.");
      }
      if (
        synced.configuration.overallGrandFinalEndDate < grandFinalBounds.minDate
        || synced.configuration.overallGrandFinalEndDate > grandFinalBounds.maxDate
      ) {
        push("grand-final", "Grand final end date must stay inside the final semester window.");
      }
    }
    if (!synced.configuration.overallAwards.length) {
      push("grand-final", "Add at least one grand final award.");
    }
    synced.configuration.overallAwards.forEach((award, index) => {
      if (!award.awardName.trim()) {
        push("grand-final", `Grand final award ${index + 1} needs a name.`);
      }
      if (Number(award.quantity) < 1) {
        push("grand-final", "Grand final award quantity must be greater than 0.");
      }
    });
  }

  return entries;
}

function SecondaryActionButton({ children, ...props }) {
  return (
    <Button
      variant="outlined"
      sx={{
        height: 40,
        borderRadius: 999,
        px: 2.1,
        borderColor: brand.colors.lineStrong,
        color: brand.colors.text,
        fontWeight: 800,
        "&:hover": {
          borderColor: brand.colors.navy,
          bgcolor: "#F8FAFF",
        },
      }}
      {...props}
    >
      {children}
    </Button>
  );
}

function PrimaryActionButton({ children, ...props }) {
  return (
    <Button
      variant="contained"
      sx={{
        height: 40,
        borderRadius: 999,
        px: 2.3,
        bgcolor: brand.colors.orange,
        color: brand.colors.inverse,
        fontWeight: 900,
        boxShadow: "none",
        "&:hover": {
          bgcolor: brand.colors.orangeDark,
          boxShadow: "none",
        },
      }}
      {...props}
    >
      {children}
    </Button>
  );
}

function ActionPill({ label }) {
  return (
    <Chip
      label={label}
      sx={{
        height: 38,
        bgcolor: brand.colors.surfaceWarm,
        color: brand.colors.orange,
        fontWeight: 900,
        borderRadius: 999,
        "& .MuiChip-label": {
          px: 1.6,
          display: "flex",
          justifyContent: "center",
          width: "100%",
        },
      }}
    />
  );
}

function formatEventSemesterRange(event) {
  const startSemester = event.configuration?.startSemester?.trim();
  const endSemester = event.configuration?.endSemester?.trim();
  if (startSemester && endSemester) {
    return startSemester === endSemester ? startSemester : `${startSemester} -> ${endSemester}`;
  }
  const season = String(event.season || "").trim();
  const year = event.year ? String(event.year).trim() : "";
  return [season, year].filter(Boolean).join(" - ") || "Semester range pending";
}

function EventCardSummary({ event, onEdit, onDelete }) {
  const seasons = event.configuration?.seasons || [];
  const roundCount = seasons.reduce((sum, season) => sum + (season.rounds?.length || 0), 0);
  const trackCount = seasons.reduce((sum, season) => sum + (season.tracks?.length || 0), 0);
  const seasonCount = seasons.length;
  const semesterRangeLabel = formatEventSemesterRange(event);

  return (
    <Card sx={{ borderRadius: brand.radius.xl, border: `1px solid ${brand.colors.line}`, boxShadow: brand.shadow.sm }}>
      <CardContent sx={{ p: { xs: 2, md: 2.4 } }}>
        <Stack
          direction={{ xs: "column", xl: "row" }}
          justifyContent="space-between"
          spacing={{ xs: 2, xl: 3 }}
          alignItems={{ xs: "stretch", xl: "center" }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={0.9} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              <Chip
                label={event.status}
                sx={{
                  height: 34,
                  borderRadius: 999,
                  bgcolor: "#F2F5FA",
                  color: brand.colors.text,
                  fontWeight: 900,
                }}
              />
              <Chip
                label={semesterRangeLabel}
                sx={{
                  maxWidth: "100%",
                  height: 34,
                  borderRadius: 999,
                  bgcolor: brand.colors.surfaceWarm,
                  color: brand.colors.orange,
                  fontWeight: 900,
                  "& .MuiChip-label": {
                    display: "block",
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    px: 1.5,
                  },
                }}
              />
            </Stack>
            <Typography sx={{ color: brand.colors.text, fontSize: 24, fontWeight: 950 }}>{event.name}</Typography>
            <Typography sx={{ color: brand.colors.muted, fontSize: 14, mt: 0.45 }}>
              {event.description || "No description yet."}
            </Typography>
          </Box>

          <Stack spacing={1.2} sx={{ width: { xs: "100%", xl: "auto" }, minWidth: { xl: 420 } }}>
            <Stack direction="row" spacing={1} justifyContent={{ xs: "flex-start", xl: "flex-end" }} flexWrap="wrap" useFlexGap>
              <HighlightPill
                label={`${seasonCount} semester${seasonCount === 1 ? "" : "s"}`}
                sx={{ minWidth: 112 }}
              />
              <HighlightPill
                label={`${trackCount} track${trackCount === 1 ? "" : "s"}`}
                sx={{ minWidth: 104 }}
              />
              <HighlightPill
                label={`${roundCount} round${roundCount === 1 ? "" : "s"}`}
                sx={{ minWidth: 110 }}
              />
            </Stack>

            <Stack direction="row" spacing={1} justifyContent={{ xs: "flex-start", xl: "flex-end" }}>
              <SecondaryActionButton
                startIcon={<EditRoundedIcon />}
                onClick={onEdit}
                sx={{ minWidth: 96, justifyContent: "center" }}
              >
                Edit
              </SecondaryActionButton>
              <SecondaryActionButton
                startIcon={<DeleteOutlineRoundedIcon />}
                onClick={onDelete}
                sx={{
                  minWidth: 96,
                  justifyContent: "center",
                  color: brand.colors.danger,
                  borderColor: "#F3C7C1",
                  "&:hover": {
                    borderColor: "#E9A59C",
                    bgcolor: "#FFF8F7",
                  },
                }}
              >
                Delete
              </SecondaryActionButton>
            </Stack>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function WizardProgress({ steps, activeStep, maxAccessibleStep, onStepSelect, stepStates = null }) {
  return (
    <Box sx={{ overflowX: "auto", pb: 0.5 }}>
      <Stack direction="row" spacing={0} alignItems="flex-start" sx={{ minWidth: 1120, px: 1, pt: 1 }}>
        {steps.map((step, index) => {
          const Icon = step.icon;
          const active = index === activeStep;
          const fallbackComplete = index < maxAccessibleStep || (maxAccessibleStep === steps.length - 1 && index < activeStep);
          const fallbackClickable = index <= maxAccessibleStep;
          const state = stepStates?.[index];
          const highlighted = state ? state.editable : (fallbackComplete || active);
          const clickable = state ? state.clickable : fallbackClickable;
          return (
            <Box
              key={step.key}
              sx={{
                flex: 1,
                minWidth: 0,
                position: "relative",
                cursor: clickable ? "pointer" : "default",
                opacity: clickable ? 1 : 0.72,
              }}
              onClick={() => {
                if (clickable) {
                  onStepSelect(index);
                }
              }}
            >
              <Stack alignItems="center" spacing={1}>
                <Stack direction="row" alignItems="center" sx={{ width: "100%" }}>
                  {index > 0 ? (
                    <Box
                      sx={{
                        flex: 1,
                        height: 3,
                        bgcolor: highlighted ? "#5EBF67" : "#DCE4EF",
                      }}
                    />
                  ) : (
                    <Box sx={{ flex: 1 }} />
                  )}
                  <Box
                    sx={{
                      width: 60,
                      height: 60,
                      borderRadius: "50%",
                      border: `3px solid ${highlighted ? "#5EBF67" : "#DCE4EF"}`,
                      bgcolor: highlighted ? "#F6FFF7" : "#FFFFFF",
                      color: highlighted ? "#5EBF67" : brand.colors.muted,
                      display: "grid",
                      placeItems: "center",
                      boxShadow: active
                        ? highlighted
                          ? "0 12px 28px rgba(94, 191, 103, 0.18)"
                          : "0 10px 24px rgba(15, 23, 42, 0.08)"
                        : "none",
                    }}
                  >
                    <Icon />
                  </Box>
                  {index < steps.length - 1 ? (
                    <Box
                      sx={{
                        flex: 1,
                        height: 3,
                        bgcolor: highlighted && (!stepStates || stepStates[index + 1]?.editable) ? "#5EBF67" : "#DCE4EF",
                      }}
                    />
                  ) : (
                    <Box sx={{ flex: 1 }} />
                  )}
                </Stack>
                <Box sx={{ textAlign: "center", px: 0.75 }}>
                  <Typography sx={{ color: active ? brand.colors.text : brand.colors.muted, fontSize: 13, fontWeight: 900 }}>
                    {step.label}
                  </Typography>
                  <Typography sx={{ color: brand.colors.muted, fontSize: 11.5 }}>
                    {step.caption}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

function SectionCard({ title, description, children, actions = null }) {
  return (
    <Card sx={{ borderRadius: brand.radius.lg, border: `1px solid ${brand.colors.line}`, boxShadow: "none" }}>
      <CardContent sx={{ p: { xs: 1.5, md: 1.8 } }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.2} sx={{ mb: 1.4 }}>
          <Box>
            <Typography sx={{ color: brand.colors.text, fontSize: 17, fontWeight: 900 }}>{title}</Typography>
            {description ? (
              <Typography sx={{ color: brand.colors.muted, fontSize: 13, mt: 0.4 }}>{description}</Typography>
            ) : null}
          </Box>
          {actions}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

function DateSelectField({ label, value, minDate, maxDate, onChange, helperText = "", disabled = false }) {
  const parsed = parseIsoDate(value);
  const selectedYear = parsed?.year || "";
  const selectedMonth = parsed?.month || "";
  const selectedDay = parsed?.day || "";
  const yearOptions = getYearOptions(minDate, maxDate);
  const monthOptions = getMonthOptions(selectedYear || yearOptions[0], minDate, maxDate);
  const dayOptions = getDayOptions(selectedYear || yearOptions[0], selectedMonth || monthOptions[0], minDate, maxDate);

  const commit = (nextYear, nextMonth, nextDay) => {
    if (!nextYear || !nextMonth || !nextDay) {
      onChange("");
      return;
    }
    const validDays = getDayOptions(nextYear, nextMonth, minDate, maxDate);
    const normalizedDay = validDays.includes(nextDay) ? nextDay : validDays.at(-1);
    onChange(buildIsoDate(nextYear, nextMonth, normalizedDay));
  };

  const handleYearChange = (year) => {
    const availableMonths = getMonthOptions(year, minDate, maxDate);
    const normalizedMonth = availableMonths.includes(selectedMonth) ? selectedMonth : availableMonths[0];
    const availableDays = getDayOptions(year, normalizedMonth, minDate, maxDate);
    const normalizedDay = availableDays.includes(selectedDay) ? selectedDay : availableDays[0];
    commit(year, normalizedMonth, normalizedDay);
  };

  const handleMonthChange = (month) => {
    const normalizedYear = selectedYear || yearOptions[0];
    const availableDays = getDayOptions(normalizedYear, month, minDate, maxDate);
    const normalizedDay = availableDays.includes(selectedDay) ? selectedDay : availableDays[0];
    commit(normalizedYear, month, normalizedDay);
  };

  return (
    <Box
      sx={{
        border: `1px solid ${brand.colors.line}`,
        borderRadius: brand.radius.md,
        px: 1.25,
        py: 1.1,
        bgcolor: brand.colors.surface,
      }}
    >
      <Typography sx={{ color: brand.colors.muted, fontSize: 12.5, fontWeight: 700, mb: 0.9 }}>
        {label}
      </Typography>
      <Stack direction={{ xs: "column", lg: "row" }} spacing={1} alignItems={{ xs: "stretch", lg: "center" }}>
        <FormControl size="small" sx={{ minWidth: { xs: "100%", lg: 110 } }}>
          <InputLabel id={`${label}-day`}>Day</InputLabel>
          <Select
            labelId={`${label}-day`}
            label="Day"
            value={selectedDay}
            disabled={disabled}
            onChange={(event) => commit(selectedYear || yearOptions[0], selectedMonth || monthOptions[0], Number(event.target.value))}
          >
            <MenuItem value="">
              <em>Select day</em>
            </MenuItem>
            {dayOptions.map((day) => (
              <MenuItem key={`${label}-day-${day}`} value={day}>
                {String(day).padStart(2, "0")}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: { xs: "100%", lg: 150 } }}>
          <InputLabel id={`${label}-month`}>Month</InputLabel>
          <Select
            labelId={`${label}-month`}
            label="Month"
            value={selectedMonth}
            disabled={disabled}
            onChange={(event) => handleMonthChange(Number(event.target.value))}
          >
            <MenuItem value="">
              <em>Select month</em>
            </MenuItem>
            {monthOptions.map((month) => (
              <MenuItem key={`${label}-month-${month}`} value={month}>
                {monthLabel(month)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: { xs: "100%", lg: 120 } }}>
          <InputLabel id={`${label}-year`}>Year</InputLabel>
          <Select
            labelId={`${label}-year`}
            label="Year"
            value={selectedYear}
            disabled={disabled}
            onChange={(event) => handleYearChange(Number(event.target.value))}
          >
            <MenuItem value="">
              <em>Select year</em>
            </MenuItem>
            {yearOptions.map((year) => (
              <MenuItem key={`${label}-year-${year}`} value={year}>
                {year}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Chip
          label={`Allowed: ${formatRangeLabel(minDate, maxDate)}`}
          sx={{
            height: 34,
            bgcolor: brand.colors.surfaceSoft,
            color: brand.colors.muted,
            fontWeight: 700,
            alignSelf: { xs: "flex-start", lg: "center" },
          }}
        />
      </Stack>
      {helperText ? (
        <Typography sx={{ color: brand.colors.muted, fontSize: 12, mt: 0.9 }}>
          {helperText}
        </Typography>
      ) : null}
    </Box>
  );
}

export default function EventConfigurationPanel({ onDirtyChange = () => {} }) {
  const semesterOptions = useMemo(() => createSemesterOptions(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [wizardError, setWizardError] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState("create");
  const [editingEventId, setEditingEventId] = useState(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardDraft, setWizardDraft] = useState(createEmptyWizardDraft());
  const [originalSnapshot, setOriginalSnapshot] = useState("");

  const selectedEventId = searchParams.get("eventId");
  const validationEntries = useMemo(() => validateWizard(wizardDraft), [wizardDraft]);
  const wizardDirty = useMemo(() => JSON.stringify(buildPayload(wizardDraft)) !== originalSnapshot, [wizardDraft, originalSnapshot]);
  const activeStepKey = WIZARD_STEPS[wizardStep]?.key;
  const activeStepErrors = useMemo(
    () => validationEntries.filter((entry) => entry.step === activeStepKey),
    [activeStepKey, validationEntries]
  );
  const maxAccessibleStep = useMemo(() => getMaxAccessibleWizardStep(wizardDraft), [wizardDraft]);
  const todayIso = useMemo(() => buildIsoDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()), []);
  const editPolicy = useMemo(() => getEventEditPolicy(wizardMode, wizardDraft, todayIso), [wizardMode, wizardDraft, todayIso]);
  const editableStepKeys = useMemo(() => getEditableStepKeys(editPolicy), [editPolicy]);
  const wizardStepStates = useMemo(
    () => (
      wizardMode === "edit"
        ? WIZARD_STEPS.map((step) => ({
            editable: editableStepKeys.has(step.key),
            clickable: true,
          }))
        : null
    ),
    [editableStepKeys, wizardMode]
  );
  const allowDraftSave = wizardMode !== "edit" || normalizeEventStatus(wizardDraft.event.status) === "DRAFT";
  const draftEvents = useMemo(
    () => events.filter((event) => String(event.status || "").trim().toLowerCase() === "draft"),
    [events]
  );
  const publishedEvents = useMemo(
    () => events.filter((event) => String(event.status || "").trim().toLowerCase() !== "draft"),
    [events]
  );

  useEffect(() => {
    onDirtyChange(wizardOpen && wizardDirty);
  }, [onDirtyChange, wizardDirty, wizardOpen]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const fetchEvents = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await http.get("/api/coordinator/events");
      setEvents(response.data?.data || []);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Failed to load events."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (!selectedEventId || loading || !events.length) return;
    const event = events.find((item) => String(item.eventId) === String(selectedEventId));
    if (!event) return;
    openWizard("edit", event);
  }, [events, loading, selectedEventId]);

  const patchWizardDraft = (producer) => {
    setWizardDraft((current) => syncWizardDraft(typeof producer === "function" ? producer(current) : producer));
  };

  const getCurrentDraftStorageKey = (mode = wizardMode, eventId = editingEventId) =>
    getEventWizardDraftStorageKey(mode === "create" ? "new" : eventId);

  const persistWizardDraft = (nextDraft = wizardDraft, nextStep = wizardStep, mode = wizardMode, eventId = editingEventId) => {
    const storageKey = getCurrentDraftStorageKey(mode, eventId);
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        draft: nextDraft,
        step: nextStep,
        mode,
        eventId: eventId ?? null,
        updatedAt: Date.now(),
      })
    );
  };

  const clearStoredWizardDraft = (mode = wizardMode, eventId = editingEventId) => {
    sessionStorage.removeItem(getCurrentDraftStorageKey(mode, eventId));
  };

  const openWizard = (mode, event = null) => {
    const baseDraft = mode === "create" ? createEmptyWizardDraft() : deriveDraftFromEvent(event);
    const draftStorageKey = getEventWizardDraftStorageKey(mode === "create" ? "new" : event?.eventId);
    const storedDraft = mode === "edit" ? readStoredWizardDraft(draftStorageKey) : null;
    const nextDraft = storedDraft?.draft ? syncWizardDraft(storedDraft.draft) : baseDraft;
    const restoredStep = mode === "edit" && storedDraft
      ? Math.min(Number(storedDraft.step || 0), getMaxAccessibleWizardStep(nextDraft))
      : 0;

    if (mode === "create") {
      sessionStorage.removeItem(getEventWizardDraftStorageKey("new"));
    }

    setWizardMode(mode);
    setEditingEventId(event?.eventId || null);
    setWizardDraft(nextDraft);
    setOriginalSnapshot(JSON.stringify(buildPayload(nextDraft)));
    setWizardStep(restoredStep);
    setWizardError("");
    setWizardOpen(true);
  };

  const closeWizard = () => {
    if (wizardDirty) {
      const discard = window.confirm("You have unsaved event wizard changes. Close without saving?");
      if (!discard) return;
      clearStoredWizardDraft();
    }
    setWizardOpen(false);
    setWizardError("");
    setEditingEventId(null);
    if (selectedEventId) {
      window.dispatchEvent(new Event("seal-skip-next-search-guard"));
      setSearchParams({ section: "event-config" }, { replace: true });
    }
  };

  const moveStep = (direction) => {
    if (direction > 0 && activeStepErrors.length) {
      setWizardError(activeStepErrors[0].message);
      return;
    }
    setWizardError("");
    setWizardStep((current) => Math.min(Math.max(current + direction, 0), WIZARD_STEPS.length - 1));
  };

  const selectWizardStep = (targetStep) => {
    if (wizardMode === "edit") {
      setWizardError("");
      setWizardStep(targetStep);
      return;
    }
    if (targetStep > maxAccessibleStep) {
      const blockedStep = WIZARD_STEPS[maxAccessibleStep];
      setWizardError(`Complete ${blockedStep.label} before opening later steps.`);
      return;
    }
    setWizardError("");
    setWizardStep(targetStep);
  };

  const saveDraftToServer = async () => {
    setSaving(true);
    setWizardError("");
    try {
      const payload = buildDraftPayload(wizardDraft);
      let savedEvent = null;

      if (wizardMode === "create") {
        const response = await http.post("/api/coordinator/events/setup", payload);
        savedEvent = response.data?.data || response.data || null;
      } else {
        const response = await http.put(`/api/coordinator/events/${editingEventId}/configuration`, payload);
        savedEvent = response.data?.data || response.data || null;
      }

      const previousStorageKey = getCurrentDraftStorageKey(wizardMode, editingEventId);
      const nextEventId = savedEvent?.eventId || editingEventId;
      persistWizardDraft(wizardDraft, wizardStep, "edit", nextEventId);
      if (previousStorageKey !== getEventWizardDraftStorageKey(nextEventId)) {
        sessionStorage.removeItem(previousStorageKey);
      }

      if (savedEvent?.eventId && wizardMode === "create") {
        setWizardMode("edit");
        setEditingEventId(savedEvent.eventId);
        window.dispatchEvent(new Event("seal-skip-next-search-guard"));
        setSearchParams({ section: "event-config", eventId: String(savedEvent.eventId) }, { replace: true });
      }

      setWizardDraft(deriveDraftFromEvent(savedEvent || { ...payload.event, eventId: nextEventId, configuration: payload.configuration }));
      setOriginalSnapshot(JSON.stringify(buildPayload(deriveDraftFromEvent(savedEvent || { ...payload.event, eventId: nextEventId, configuration: payload.configuration }))));
      await fetchEvents();
      setWizardOpen(false);
      setWizardError("");
      setEditingEventId(null);
      window.dispatchEvent(new Event("seal-skip-next-search-guard"));
      setSearchParams({ section: "event-config" }, { replace: true });
    } catch (requestError) {
      setWizardError(getDraftSaveErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const saveLocalDraft = () => {
    persistWizardDraft(wizardDraft, wizardStep);

    if (wizardMode === "edit" && wizardDraft.event.status !== "Draft") {
      setOriginalSnapshot(JSON.stringify(buildPayload(wizardDraft)));
      setWizardError("Draft saved locally. Publish when you are ready to update this configured event.");
      return;
    }

    void saveDraftToServer();
  };

  const saveWizard = async (statusOverride) => {
    if (!editPolicy.canSubmitChanges) {
      setWizardError("This event status is view-only and cannot be updated.");
      return;
    }
    const allErrors = validateWizard(wizardDraft);
    if (allErrors.length) {
      const firstError = allErrors[0];
      const stepIndex = WIZARD_STEPS.findIndex((step) => step.key === firstError.step);
      if (stepIndex >= 0) setWizardStep(stepIndex);
      setWizardError(firstError.message);
      return;
    }

    setSaving(true);
    setWizardError("");
    try {
      const payload = buildPayload(wizardDraft, statusOverride);
      if (wizardMode === "create") {
        await http.post("/api/coordinator/events/setup", payload);
      } else {
        await http.put(`/api/coordinator/events/${editingEventId}/configuration`, payload);
      }
      await fetchEvents();
      clearStoredWizardDraft(wizardMode, editingEventId);
      setWizardOpen(false);
      setEditingEventId(null);
      if (selectedEventId) {
        window.dispatchEvent(new Event("seal-skip-next-search-guard"));
        setSearchParams({ section: "event-config" }, { replace: true });
      }
    } catch (requestError) {
      setWizardError(getApiErrorMessage(requestError, "Failed to save event wizard."));
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (eventId) => {
    const confirmed = window.confirm("Delete this event? This action cannot be undone.");
    if (!confirmed) return;
    setSaving(true);
    try {
      await http.delete(`/api/coordinator/events/${eventId}`);
      await fetchEvents();
      if (String(selectedEventId || "") === String(eventId)) {
        window.dispatchEvent(new Event("seal-skip-next-search-guard"));
        setSearchParams({ section: "event-config" }, { replace: true });
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Failed to delete event."));
    } finally {
      setSaving(false);
    }
  };

  const semesterPreview = getConsecutiveSemesterRange(wizardDraft.event.startSemester, wizardDraft.event.endSemester);

  const renderStepContent = () => {
    if (activeStepKey === "basic") {
      return (
        <SectionCard
          title="Step 1: Create Event Basic Information"
          description="Start with the event name and description. No separate year field is needed because the semester range already carries the year."
        >
          <Stack spacing={1.4}>
            <TextField
              label="Event Name"
              value={wizardDraft.event.name}
              disabled={!editPolicy.canEditName}
              onChange={(event) => patchWizardDraft((current) => ({
                ...current,
                event: { ...current.event, name: event.target.value },
              }))}
              fullWidth
            />
            <TextField
              label="Description"
              value={wizardDraft.event.description}
              disabled={!editPolicy.canEditDescription}
              onChange={(event) => patchWizardDraft((current) => ({
                ...current,
                event: { ...current.event, description: event.target.value },
              }))}
              fullWidth
              multiline
              rows={4}
            />
          </Stack>
        </SectionCard>
      );
    }

    if (activeStepKey === "range") {
      return (
        <SectionCard
          title="Step 2-3: Select Semester Range and Preview"
          description="Choose only a start semester and an end semester. The system automatically generates all consecutive semesters in between."
        >
          <Stack spacing={1.5}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
              <FormControl fullWidth>
                <InputLabel id="start-semester-label">Start Semester</InputLabel>
                <Select
                  labelId="start-semester-label"
                  value={wizardDraft.event.startSemester}
                  label="Start Semester"
                  disabled={!editPolicy.canEditSemesterRange}
                  onChange={(event) => patchWizardDraft((current) => ({
                    ...current,
                    event: { ...current.event, startSemester: event.target.value },
                  }))}
                >
                  {semesterOptions.map((option) => (
                    <MenuItem key={`start-${option.label}`} value={option.label}>{option.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="end-semester-label">End Semester</InputLabel>
                <Select
                  labelId="end-semester-label"
                  value={wizardDraft.event.endSemester}
                  label="End Semester"
                  disabled={!editPolicy.canEditSemesterRange}
                  onChange={(event) => patchWizardDraft((current) => ({
                    ...current,
                    event: { ...current.event, endSemester: event.target.value },
                  }))}
                >
                  {semesterOptions.map((option) => (
                    <MenuItem key={`end-${option.label}`} value={option.label}>{option.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            {semesterPreview.length ? (
              <Alert severity="info" variant="outlined">
                Generated consecutive semesters: {semesterPreview.map(semesterLabel).join(" -> ")}
              </Alert>
            ) : (
              <Alert severity="warning" variant="outlined">
                End Semester must not be before Start Semester.
              </Alert>
            )}
          </Stack>
        </SectionCard>
      );
    }

    if (activeStepKey === "dates") {
      return (
        <Stack spacing={1.5}>
          {wizardDraft.configuration.seasons.map((season, seasonIdx) => {
            const ref = { season: season.season, year: season.year };
            const bounds = semesterBounds(ref);
            return (
              <SectionCard
                key={semesterLabel(ref)}
                title={`Step 4: Configure Dates for ${semesterLabel(ref)}`}
                description={`${bounds.hint}. All semester dates must remain inside this allowed range.`}
              >
                <Stack spacing={1.2}>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
                    <DateSelectField
                      label="Registration Start Date"
                      value={season.registrationStartDate}
                      minDate={bounds.start}
                      maxDate={bounds.end}
                      disabled={!editPolicy.canEditSemesterDates}
                      helperText="Pick the first day teams can start registering."
                      onChange={(event) => patchWizardDraft((current) => {
                        const seasons = [...current.configuration.seasons];
                        seasons[seasonIdx] = { ...seasons[seasonIdx], registrationStartDate: event };
                        return { ...current, configuration: { ...current.configuration, seasons } };
                      })}
                    />
                    <DateSelectField
                      label="Registration End Date"
                      value={season.registrationEndDate}
                      minDate={bounds.start}
                      maxDate={bounds.end}
                      disabled={!editPolicy.canEditSemesterDates}
                      helperText="This must be on or after the registration start date."
                      onChange={(event) => patchWizardDraft((current) => {
                        const seasons = [...current.configuration.seasons];
                        seasons[seasonIdx] = { ...seasons[seasonIdx], registrationEndDate: event };
                        return { ...current, configuration: { ...current.configuration, seasons } };
                      })}
                    />
                  </Stack>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
                    <DateSelectField
                      label="Competition Start Date"
                      value={season.competitionStartDate}
                      minDate={bounds.start}
                      maxDate={bounds.end}
                      disabled={!editPolicy.canEditSemesterDates}
                      helperText="Competition must begin after registration is closed."
                      onChange={(event) => patchWizardDraft((current) => {
                        const seasons = [...current.configuration.seasons];
                        seasons[seasonIdx] = { ...seasons[seasonIdx], competitionStartDate: event };
                        return { ...current, configuration: { ...current.configuration, seasons } };
                      })}
                    />
                    <DateSelectField
                      label="Competition End Date"
                      value={season.competitionEndDate}
                      minDate={bounds.start}
                      maxDate={bounds.end}
                      disabled={!editPolicy.canEditSemesterDates}
                      helperText="This is the last day the semester competition can run."
                      onChange={(event) => patchWizardDraft((current) => {
                        const seasons = [...current.configuration.seasons];
                        seasons[seasonIdx] = { ...seasons[seasonIdx], competitionEndDate: event };
                        return { ...current, configuration: { ...current.configuration, seasons } };
                      })}
                    />
                  </Stack>
                </Stack>
              </SectionCard>
            );
          })}
        </Stack>
      );
    }

    if (activeStepKey === "tracks") {
      return (
        <Stack spacing={1.5}>
          {wizardDraft.configuration.seasons.map((season, seasonIdx) => (
            <SectionCard
              key={semesterLabel(season)}
              title={`Step 5: Configure Tracks for ${semesterLabel(season)}`}
              description="Each semester can have multiple tracks such as AI, Web, Mobile, or IoT."
              actions={
                <Button size="small" startIcon={<AddRoundedIcon />} disabled={!editPolicy.canEditTracks} onClick={() => patchWizardDraft((current) => {
                  const seasons = [...current.configuration.seasons];
                  seasons[seasonIdx] = {
                    ...seasons[seasonIdx],
                    tracks: [...seasons[seasonIdx].tracks, createTrackDraft("", "")],
                  };
                  return { ...current, configuration: { ...current.configuration, seasons } };
                })}>
                  Add track
                </Button>
              }
            >
              <Stack spacing={1.1}>
                {season.tracks.map((track, trackIdx) => (
                  <Stack key={track.trackKey} direction={{ xs: "column", md: "row" }} spacing={1}>
                    <TextField
                      label={`Track ${trackIdx + 1} Name`}
                      value={track.name}
                      disabled={!editPolicy.canEditTracks}
                      onChange={(event) => patchWizardDraft((current) => {
                        const seasons = [...current.configuration.seasons];
                        const tracks = [...seasons[seasonIdx].tracks];
                        tracks[trackIdx] = { ...tracks[trackIdx], name: event.target.value };
                        seasons[seasonIdx] = { ...seasons[seasonIdx], tracks };
                        return { ...current, configuration: { ...current.configuration, seasons } };
                      })}
                      fullWidth
                    />
                    <TextField
                      label="Description"
                      value={track.description}
                      disabled={!editPolicy.canEditTracks}
                      onChange={(event) => patchWizardDraft((current) => {
                        const seasons = [...current.configuration.seasons];
                        const tracks = [...seasons[seasonIdx].tracks];
                        tracks[trackIdx] = { ...tracks[trackIdx], description: event.target.value };
                        seasons[seasonIdx] = { ...seasons[seasonIdx], tracks };
                        return { ...current, configuration: { ...current.configuration, seasons } };
                      })}
                      fullWidth
                    />
                    <IconButton
                      color="error"
                      disabled={!editPolicy.canEditTracks || season.tracks.length <= 1}
                      onClick={() => patchWizardDraft((current) => {
                        const seasons = [...current.configuration.seasons];
                        seasons[seasonIdx] = {
                          ...seasons[seasonIdx],
                          tracks: seasons[seasonIdx].tracks.filter((_, index) => index !== trackIdx),
                        };
                        return { ...current, configuration: { ...current.configuration, seasons } };
                      })}
                      sx={{ border: `1px solid ${brand.colors.line}`, alignSelf: { xs: "flex-end", md: "center" } }}
                    >
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            </SectionCard>
          ))}
        </Stack>
      );
    }

    if (activeStepKey === "assignment") {
      return (
        <Stack spacing={1.5}>
          {wizardDraft.configuration.seasons.map((season, seasonIdx) => (
            <SectionCard
              key={semesterLabel(season)}
              title={`Step 6: Track Assignment Mode for ${semesterLabel(season)}`}
              description="Decide whether teams choose a track or the system randomly assigns one."
            >
              <FormControl fullWidth>
                <InputLabel id={`mode-${seasonIdx}`}>Track Assignment Mode</InputLabel>
                <Select
                  labelId={`mode-${seasonIdx}`}
                  label="Track Assignment Mode"
                  value={season.trackSelectionMode}
                  disabled={!editPolicy.canEditTrackMode}
                  onChange={(event) => patchWizardDraft((current) => {
                    const seasons = [...current.configuration.seasons];
                    seasons[seasonIdx] = { ...seasons[seasonIdx], trackSelectionMode: event.target.value };
                    return { ...current, configuration: { ...current.configuration, seasons } };
                  })}
                >
                  {TRACK_ASSIGNMENT_MODES.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </SectionCard>
          ))}
        </Stack>
      );
    }

    if (activeStepKey === "rounds") {
      return (
        <Box component="fieldset" disabled={!editPolicy.canEditRounds} sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
        <Stack spacing={1.5} sx={{ opacity: editPolicy.canEditRounds ? 1 : 0.68 }}>
          {wizardDraft.configuration.seasons.map((season, seasonIdx) => {
            const regularRounds = season.rounds.filter((round) => !round.finalRound);
            const finalRound = season.rounds.find((round) => round.finalRound);
            const roundBounds = getSeasonDateBounds(season);
            const roundDateBounds = getRoundDateBounds(season);
            const competitionWindowLabel = getCompetitionWindowLabel(season);

            const updateRound = (roundKey, patch) => patchWizardDraft((current) => {
              const seasons = [...current.configuration.seasons];
              const rounds = [...seasons[seasonIdx].rounds];
              const targetIdx = rounds.findIndex((round) => round.roundKey === roundKey);
              if (targetIdx >= 0) {
                rounds[targetIdx] = { ...rounds[targetIdx], ...patch };
              }
              seasons[seasonIdx] = { ...seasons[seasonIdx], rounds };
              return { ...current, configuration: { ...current.configuration, seasons } };
            });

            const deleteRegularRound = (roundKey) => patchWizardDraft((current) => {
              const seasons = [...current.configuration.seasons];
              const currentSeason = seasons[seasonIdx];
              const keptRegularRounds = currentSeason.rounds.filter((round) => !round.finalRound && round.roundKey !== roundKey);
              const currentFinalRound = currentSeason.rounds.find((round) => round.finalRound);
              const reorderedRounds = [
                ...keptRegularRounds.map((round, index) => ({ ...round, roundOrder: index + 1, finalRound: false })),
                { ...currentFinalRound, roundOrder: keptRegularRounds.length + 1, finalRound: true },
              ];
              seasons[seasonIdx] = { ...currentSeason, rounds: reorderedRounds };
              return { ...current, configuration: { ...current.configuration, seasons } };
            });

            return (
              <SectionCard
                key={semesterLabel(season)}
                title={`Step 7: Configure Rounds for ${semesterLabel(season)}`}
                description={`Separate qualifying rounds from the final round. Promotion rules only start from qualifying rounds. Current competition window: ${competitionWindowLabel}.`}
                actions={
                  <Button size="small" startIcon={<AddRoundedIcon />} disabled={!editPolicy.canEditRounds} onClick={() => patchWizardDraft((current) => {
                    const seasons = [...current.configuration.seasons];
                    const currentSeason = seasons[seasonIdx];
                    const currentFinalRound = currentSeason.rounds.find((round) => round.finalRound);
                    const currentRegularRounds = currentSeason.rounds.filter((round) => !round.finalRound);
                    const nextRegularCount = currentRegularRounds.length + 1;
                    const nextRoundName = currentRegularRounds.length === 0 ? "Qualifier 1" : `Qualifier ${nextRegularCount}`;
                    const newRegularRounds = [
                      ...currentRegularRounds.map((round, index) => ({ ...round, roundOrder: index + 1, finalRound: false })),
                      createRoundDraft(nextRegularCount, nextRoundName, false),
                    ];
                    seasons[seasonIdx] = {
                      ...currentSeason,
                      rounds: [
                        ...newRegularRounds.map((round, index) => ({ ...round, roundOrder: index + 1, finalRound: false })),
                        { ...currentFinalRound, roundOrder: newRegularRounds.length + 1, finalRound: true },
                      ],
                    };
                    return { ...current, configuration: { ...current.configuration, seasons } };
                  })}>
                    Add qualifying round
                  </Button>
                }
              >
                <Stack spacing={1.4}>
                  <SectionCard
                    title="Qualifying Rounds"
                    description="These rounds can promote teams forward. You can add or remove them as needed."
                  >
                    <Stack spacing={1.1}>
                      {regularRounds.length === 0 ? (
                        <Alert severity="info" variant="outlined">
                          No qualifying rounds yet. Add at least one round before the final stage.
                        </Alert>
                      ) : (
                        regularRounds.map((round) => (
                          <Card key={round.roundKey} variant="outlined" sx={{ borderRadius: brand.radius.md }}>
                            <CardContent sx={{ p: 1.5 }}>
                              <Stack spacing={1.1}>
                                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                                  <TextField
                                    label="Round Name"
                                    value={round.roundName}
                                    disabled={!editPolicy.canEditRounds}
                                    onChange={(event) => updateRound(round.roundKey, { roundName: event.target.value })}
                                    fullWidth
                                  />
                                  <TextField
                                    label="Round Order"
                                    type="number"
                                    value={round.roundOrder}
                                    disabled
                                    sx={{ width: { xs: "100%", md: 120 } }}
                                  />
                                  <IconButton
                                    color="error"
                                    onClick={() => deleteRegularRound(round.roundKey)}
                                    disabled={!editPolicy.canEditRounds || regularRounds.length <= 1}
                                    sx={{ border: `1px solid ${brand.colors.line}`, alignSelf: { xs: "flex-end", md: "center" } }}
                                  >
                                    <DeleteOutlineRoundedIcon fontSize="small" />
                                  </IconButton>
                                </Stack>
                                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                                <DateSelectField
                                  label="Start Date"
                                  value={round.startDate}
                                  minDate={roundDateBounds.start}
                                  maxDate={roundDateBounds.end}
                                  disabled={!editPolicy.canEditRounds}
                                  helperText={
                                    roundDateBounds.source === "competition"
                                      ? "Choose a day inside the configured competition window."
                                      : "Choose a day inside the semester range first. It will narrow to the competition window after you set competition dates."
                                  }
                                  onChange={(nextValue) => updateRound(round.roundKey, { startDate: nextValue })}
                                />
                                <DateSelectField
                                  label="End Date"
                                  value={round.endDate}
                                  minDate={roundDateBounds.start}
                                  maxDate={roundDateBounds.end}
                                  disabled={!editPolicy.canEditRounds}
                                  helperText="End date must be on or after the round start date, and stay inside the competition window."
                                  onChange={(nextValue) => updateRound(round.roundKey, { endDate: nextValue })}
                                />
                                </Stack>
                              </Stack>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </Stack>
                  </SectionCard>

                  <SectionCard
                    title="Final Round"
                    description="This is the last stage of the semester. It does not create a new promotion rule after itself."
                  >
                    {finalRound ? (
                      <Card variant="outlined" sx={{ borderRadius: brand.radius.md }}>
                        <CardContent sx={{ p: 1.5 }}>
                          <Stack spacing={1.1}>
                            <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                              <TextField
                                label="Final Round Name"
                                value={finalRound.roundName}
                                disabled={!editPolicy.canEditRounds}
                                onChange={(event) => updateRound(finalRound.roundKey, { roundName: event.target.value })}
                                fullWidth
                              />
                              <TextField
                                label="Round Order"
                                type="number"
                                value={finalRound.roundOrder}
                                disabled
                                sx={{ width: { xs: "100%", md: 120 } }}
                              />
                              <Chip
                                label="Final"
                                sx={{ height: 40, bgcolor: brand.colors.surfaceWarm, color: brand.colors.orange, fontWeight: 900, alignSelf: { xs: "flex-start", md: "center" } }}
                              />
                            </Stack>
                            <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                              <DateSelectField
                                label="Final Start Date"
                                value={finalRound.startDate}
                                minDate={roundDateBounds.start}
                                maxDate={roundDateBounds.end}
                                disabled={!editPolicy.canEditRounds}
                                helperText={
                                  roundDateBounds.source === "competition"
                                    ? "Choose a day inside the configured competition window."
                                    : "Choose a day inside the semester range first. It will narrow to the competition window after you set competition dates."
                                }
                                onChange={(nextValue) => updateRound(finalRound.roundKey, { startDate: nextValue })}
                              />
                              <DateSelectField
                                label="Final End Date"
                                value={finalRound.endDate}
                                minDate={roundDateBounds.start}
                                maxDate={roundDateBounds.end}
                                disabled={!editPolicy.canEditRounds}
                                helperText="This is the last stage, so it should stay inside the competition window and usually near the end."
                                onChange={(nextValue) => updateRound(finalRound.roundKey, { endDate: nextValue })}
                              />
                            </Stack>
                          </Stack>
                        </CardContent>
                      </Card>
                    ) : null}
                  </SectionCard>
                </Stack>
              </SectionCard>
            );
          })}
        </Stack>
        </Box>
      );
    }

    if (activeStepKey === "promotion") {
      return (
        <Box component="fieldset" disabled={!editPolicy.canEditPromotion} sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
        <Stack spacing={1.5} sx={{ opacity: editPolicy.canEditPromotion ? 1 : 0.68 }}>
          {wizardDraft.configuration.seasons.map((season, seasonIdx) => {
            const accent = getSeasonAccent(season.season);
            return (
              <Card
                key={semesterLabel(season)}
                sx={{
                  borderRadius: brand.radius.lg,
                  border: `2px solid ${accent.border}`,
                  bgcolor: accent.soft,
                  boxShadow: "none",
                }}
              >
                <CardContent sx={{ p: 1.6 }}>
                  <Stack spacing={1.35}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", md: "center" }}
                      spacing={1}
                    >
                      <Box>
                        <Typography sx={{ color: brand.colors.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          Season Promotion Rules
                        </Typography>
                        <Typography sx={{ color: brand.colors.text, fontSize: 24, fontWeight: 950 }}>
                          {semesterLabel(season)}
                        </Typography>
                        <Typography sx={{ color: brand.colors.muted, fontSize: 13.5, mt: 0.35 }}>
                          Configure Top N per track and qualifying-round transition. The destination round follows the round order automatically.
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip
                          label={semesterLabel(season)}
                          sx={{ bgcolor: accent.chipBg, color: accent.chipText, fontWeight: 900 }}
                        />
                        <Chip
                          label={`${season.tracks.length} track${season.tracks.length === 1 ? "" : "s"}`}
                          sx={{ bgcolor: "#FFFFFF", color: brand.colors.text, fontWeight: 800 }}
                        />
                      </Stack>
                    </Stack>

                    <SectionCard
                      title={`Step 8: Promotion Rules for ${semesterLabel(season)}`}
                      description="Tracks are separated for easier scanning."
                    >
                      <Stack spacing={1}>
                        {season.tracks.map((track) => {
                          const trackRules = season.promotionRules.filter((rule) => rule.trackKey === track.trackKey);
                          return (
                            <Card key={track.trackKey} variant="outlined" sx={{ borderRadius: brand.radius.md, bgcolor: "#FFFFFF" }}>
                              <CardContent sx={{ p: 1.5 }}>
                                <Stack spacing={1.1}>
                                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                                    <Typography sx={{ color: brand.colors.text, fontSize: 17, fontWeight: 900 }}>
                                      {track.name || "Untitled track"}
                                    </Typography>
                                    <Chip
                                      label={`${trackRules.length} transition${trackRules.length === 1 ? "" : "s"}`}
                                      sx={{ bgcolor: brand.colors.surfaceWarm, color: brand.colors.orange, fontWeight: 900 }}
                                    />
                                  </Stack>

                                  {trackRules.map((rule) => {
                                    const ruleIdx = season.promotionRules.findIndex(
                                      (item) => item.trackKey === rule.trackKey && item.fromRoundKey === rule.fromRoundKey
                                    );
                                    const fromRound = season.rounds.find((item) => item.roundKey === rule.fromRoundKey);
                                    const toRound = season.rounds.find((item) => item.roundKey === rule.toRoundKey);

                                    return (
                                      <Stack
                                        key={`${rule.trackKey}-${rule.fromRoundKey}`}
                                        direction={{ xs: "column", xl: "row" }}
                                        spacing={1}
                                        sx={{
                                          p: 1.1,
                                          borderRadius: brand.radius.md,
                                          bgcolor: brand.colors.surfaceSoft,
                                        }}
                                      >
                                        <TextField label="From Round" value={fromRound?.roundName || ""} disabled fullWidth />
                                        <TextField label="To Round" value={toRound?.roundName || ""} disabled fullWidth />
                                        <TextField
                                          label="Top N Teams"
                                          type="number"
                                          value={rule.topN}
                                          disabled={!editPolicy.canEditPromotion}
                                          onChange={(event) => patchWizardDraft((current) => {
                                            const seasons = [...current.configuration.seasons];
                                            const promotionRules = [...seasons[seasonIdx].promotionRules];
                                            promotionRules[ruleIdx] = { ...promotionRules[ruleIdx], topN: Math.max(1, Number(event.target.value || 1)) };
                                            seasons[seasonIdx] = { ...seasons[seasonIdx], promotionRules };
                                            return { ...current, configuration: { ...current.configuration, seasons } };
                                          })}
                                          inputProps={{ min: 1, step: 1 }}
                                          fullWidth
                                          sx={{
                                            flexShrink: 0,
                                            width: { xs: "100%", md: 220, xl: 240 },
                                            minWidth: { xs: "100%", md: 220, xl: 240 },
                                          }}
                                        />
                                      </Stack>
                                    );
                                  })}
                                </Stack>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </Stack>
                    </SectionCard>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
        </Box>
      );
    }

    if (activeStepKey === "awards") {
      return (
        <Box component="fieldset" disabled={!editPolicy.canEditAwards} sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
        <Stack spacing={1.5} sx={{ opacity: editPolicy.canEditAwards ? 1 : 0.68 }}>
          {wizardDraft.configuration.seasons.map((season, seasonIdx) => {
            const accent = getSeasonAccent(season.season);
            return (
              <Card
                key={semesterLabel(season)}
                sx={{
                  borderRadius: brand.radius.lg,
                  border: `2px solid ${accent.border}`,
                  bgcolor: accent.soft,
                  boxShadow: "none",
                }}
              >
                <CardContent sx={{ p: 1.6 }}>
                  <Stack spacing={1.4}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", md: "center" }}
                      spacing={1}
                    >
                      <Box>
                        <Typography sx={{ color: brand.colors.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          Season Final Outcome
                        </Typography>
                        <Typography sx={{ color: brand.colors.text, fontSize: 24, fontWeight: 950 }}>
                          {semesterLabel(season)}
                        </Typography>
                        <Typography sx={{ color: brand.colors.muted, fontSize: 13.5, mt: 0.35 }}>
                          Configure the final ranking method, optional final activities, and the awards for this season.
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip
                          label={semesterLabel(season)}
                          sx={{ bgcolor: accent.chipBg, color: accent.chipText, fontWeight: 900 }}
                        />
                        <Chip
                          label={`${season.awards.length} award${season.awards.length === 1 ? "" : "s"}`}
                          sx={{ bgcolor: "#FFFFFF", color: brand.colors.text, fontWeight: 800 }}
                        />
                      </Stack>
                    </Stack>

                    <SectionCard
                      title={`Step 9: Final Mode for ${semesterLabel(season)}`}
                      description="The semester final can be ranked by score or continue with additional competition activities."
                    >
                      <Stack spacing={1.2}>
                        <FormControl fullWidth>
                          <InputLabel id={`final-mode-${seasonIdx}`}>Semester Final Ranking Method</InputLabel>
                          <Select
                            labelId={`final-mode-${seasonIdx}`}
                            label="Semester Final Ranking Method"
                            value={season.finalRankingMode}
                            disabled={!editPolicy.canEditAwards}
                            onChange={(event) => patchWizardDraft((current) => {
                              const seasons = [...current.configuration.seasons];
                              seasons[seasonIdx] = {
                                ...seasons[seasonIdx],
                                finalRankingMode: event.target.value,
                                additionalFinalActivities:
                                  event.target.value === "ADDITIONAL_COMPETITION"
                                    ? (seasons[seasonIdx].additionalFinalActivities.length ? seasons[seasonIdx].additionalFinalActivities : ["Pitching Round"])
                                    : [],
                              };
                              return { ...current, configuration: { ...current.configuration, seasons } };
                            })}
                          >
                            {FINAL_RANKING_MODES.map((option) => (
                              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        {season.finalRankingMode === "ADDITIONAL_COMPETITION" ? (
                          <SectionCard
                            title="Additional Final Activities"
                            description="Add the extra activities finalists must complete."
                            actions={
                              <Button size="small" startIcon={<AddRoundedIcon />} disabled={!editPolicy.canEditAwards} onClick={() => patchWizardDraft((current) => {
                                const seasons = [...current.configuration.seasons];
                                seasons[seasonIdx] = {
                                  ...seasons[seasonIdx],
                                  additionalFinalActivities: [...seasons[seasonIdx].additionalFinalActivities, ""],
                                };
                                return { ...current, configuration: { ...current.configuration, seasons } };
                              })}>
                                Add activity
                              </Button>
                            }
                          >
                            <Stack spacing={1}>
                              {season.additionalFinalActivities.map((activity, activityIdx) => (
                                <Stack key={`${season.season}-activity-${activityIdx}`} direction={{ xs: "column", md: "row" }} spacing={1}>
                                  <TextField
                                    label={`Activity ${activityIdx + 1}`}
                                    value={activity}
                                    disabled={!editPolicy.canEditAwards}
                                    onChange={(event) => patchWizardDraft((current) => {
                                      const seasons = [...current.configuration.seasons];
                                      const activities = [...seasons[seasonIdx].additionalFinalActivities];
                                      activities[activityIdx] = event.target.value;
                                      seasons[seasonIdx] = { ...seasons[seasonIdx], additionalFinalActivities: activities };
                                      return { ...current, configuration: { ...current.configuration, seasons } };
                                    })}
                                    fullWidth
                                  />
                                  <IconButton
                                    color="error"
                                    disabled={!editPolicy.canEditAwards}
                                    onClick={() => patchWizardDraft((current) => {
                                      const seasons = [...current.configuration.seasons];
                                      seasons[seasonIdx] = {
                                        ...seasons[seasonIdx],
                                        additionalFinalActivities: seasons[seasonIdx].additionalFinalActivities.filter((_, index) => index !== activityIdx),
                                      };
                                      return { ...current, configuration: { ...current.configuration, seasons } };
                                    })}
                                    sx={{ border: `1px solid ${brand.colors.line}`, alignSelf: { xs: "flex-end", md: "center" } }}
                                  >
                                    <DeleteOutlineRoundedIcon fontSize="small" />
                                  </IconButton>
                                </Stack>
                              ))}
                            </Stack>
                          </SectionCard>
                        ) : null}
                      </Stack>
                    </SectionCard>

                    <SectionCard
                      title={`Step 10: Semester Awards for ${semesterLabel(season)}`}
                      description="Configure the awards and quantity that will be distributed at the end of the semester final."
                      actions={
                        <Button size="small" startIcon={<AddRoundedIcon />} disabled={!editPolicy.canEditAwards} onClick={() => patchWizardDraft((current) => {
                          const seasons = [...current.configuration.seasons];
                          seasons[seasonIdx] = {
                            ...seasons[seasonIdx],
                            awards: [...seasons[seasonIdx].awards, createAwardDraft("", 1)],
                          };
                          return { ...current, configuration: { ...current.configuration, seasons } };
                        })}>
                          Add award
                        </Button>
                      }
                    >
                      <Stack spacing={1}>
                        {season.awards.map((award, awardIdx) => (
                          <Stack key={`${season.season}-award-${awardIdx}`} direction={{ xs: "column", md: "row" }} spacing={1}>
                            <TextField
                              label={`Award ${awardIdx + 1}`}
                              value={award.awardName}
                              disabled={!editPolicy.canEditAwards}
                              onChange={(event) => patchWizardDraft((current) => {
                                const seasons = [...current.configuration.seasons];
                                const awards = [...seasons[seasonIdx].awards];
                                awards[awardIdx] = { ...awards[awardIdx], awardName: event.target.value };
                                seasons[seasonIdx] = { ...seasons[seasonIdx], awards };
                                return { ...current, configuration: { ...current.configuration, seasons } };
                              })}
                              fullWidth
                            />
                            <TextField
                              label="Quantity"
                              type="number"
                              value={award.quantity}
                              disabled={!editPolicy.canEditAwards}
                              onChange={(event) => patchWizardDraft((current) => {
                                const seasons = [...current.configuration.seasons];
                                const awards = [...seasons[seasonIdx].awards];
                                awards[awardIdx] = { ...awards[awardIdx], quantity: Math.max(1, Number(event.target.value || 1)) };
                                seasons[seasonIdx] = { ...seasons[seasonIdx], awards };
                                return { ...current, configuration: { ...current.configuration, seasons } };
                              })}
                              inputProps={{ min: 1, step: 1 }}
                              sx={{ width: { xs: "100%", md: 140 } }}
                            />
                            <IconButton
                              color="error"
                              onClick={() => patchWizardDraft((current) => {
                                const seasons = [...current.configuration.seasons];
                                seasons[seasonIdx] = {
                                  ...seasons[seasonIdx],
                                  awards: seasons[seasonIdx].awards.filter((_, index) => index !== awardIdx),
                                };
                                return { ...current, configuration: { ...current.configuration, seasons } };
                              })}
                              disabled={!editPolicy.canEditAwards || season.awards.length <= 1}
                              sx={{ border: `1px solid ${brand.colors.line}`, alignSelf: { xs: "flex-end", md: "center" } }}
                            >
                              <DeleteOutlineRoundedIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        ))}
                      </Stack>
                    </SectionCard>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
        </Box>
      );
    }

    if (activeStepKey === "grand-final") {
      const grandFinalBounds = getGrandFinalDateBounds(wizardDraft);
      return (
        <Box component="fieldset" disabled={!editPolicy.canEditGrandFinal} sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
        <SectionCard
          title="Step 12: Configure Grand Final (Optional)"
          description="After all semesters are configured, decide whether to open an overall grand final across semesters."
        >
          <Stack spacing={1.4} sx={{ opacity: editPolicy.canEditGrandFinal ? 1 : 0.68 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={wizardDraft.configuration.overallGrandFinalEnabled}
                  disabled={!editPolicy.canEditGrandFinal}
                  onChange={(event) => patchWizardDraft((current) => ({
                    ...current,
                    configuration: {
                      ...current.configuration,
                      overallGrandFinalEnabled: event.target.checked,
                      overallAdditionalActivities: event.target.checked ? current.configuration.overallAdditionalActivities : [],
                      overallGrandFinalStartDate: event.target.checked ? current.configuration.overallGrandFinalStartDate : "",
                      overallGrandFinalEndDate: event.target.checked ? current.configuration.overallGrandFinalEndDate : "",
                    },
                  }))}
                />
              }
              label="Enable Grand Final"
            />

            {wizardDraft.configuration.overallGrandFinalEnabled ? (
              <Stack spacing={1.3}>
                <FormControl fullWidth>
                  <InputLabel id="grand-final-eligibility">Grand Final Eligibility</InputLabel>
                  <Select
                    labelId="grand-final-eligibility"
                    label="Grand Final Eligibility"
                    value={wizardDraft.configuration.overallGrandFinalEligibility}
                    disabled={!editPolicy.canEditGrandFinal}
                    onChange={(event) => patchWizardDraft((current) => ({
                      ...current,
                      configuration: { ...current.configuration, overallGrandFinalEligibility: event.target.value },
                    }))}
                  >
                    {GRAND_FINAL_ELIGIBILITY_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth>
                  <InputLabel id="grand-final-method">Grand Final Ranking Method</InputLabel>
                  <Select
                    labelId="grand-final-method"
                    label="Grand Final Ranking Method"
                    value={wizardDraft.configuration.overallGrandFinalMethod}
                    disabled={!editPolicy.canEditGrandFinal}
                    onChange={(event) => patchWizardDraft((current) => ({
                      ...current,
                      configuration: {
                        ...current.configuration,
                        overallGrandFinalMethod: event.target.value,
                        overallAdditionalActivities:
                          event.target.value === "ADDITIONAL_GRAND_FINAL_COMPETITION"
                            ? (current.configuration.overallAdditionalActivities.length ? current.configuration.overallAdditionalActivities : ["Grand Pitching"])
                            : [],
                      },
                    }))}
                  >
                    {GRAND_FINAL_METHOD_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                  <DateSelectField
                    label="Grand Final Start Date"
                    value={wizardDraft.configuration.overallGrandFinalStartDate}
                    minDate={grandFinalBounds.minDate}
                    maxDate={grandFinalBounds.maxDate}
                    disabled={!editPolicy.canEditGrandFinal}
                    helperText="Set the first day of the overall grand final inside the final semester window."
                    onChange={(nextValue) => patchWizardDraft((current) => ({
                      ...current,
                      configuration: { ...current.configuration, overallGrandFinalStartDate: nextValue },
                    }))}
                  />
                  <DateSelectField
                    label="Grand Final End Date"
                    value={wizardDraft.configuration.overallGrandFinalEndDate}
                    minDate={grandFinalBounds.minDate}
                    maxDate={grandFinalBounds.maxDate}
                    disabled={!editPolicy.canEditGrandFinal}
                    helperText="Grand final end date must stay inside the same allowed window."
                    onChange={(nextValue) => patchWizardDraft((current) => ({
                      ...current,
                      configuration: { ...current.configuration, overallGrandFinalEndDate: nextValue },
                    }))}
                  />
                </Stack>

                {wizardDraft.configuration.overallGrandFinalMethod === "ADDITIONAL_GRAND_FINAL_COMPETITION" ? (
                  <SectionCard
                    title="Additional Grand Final Activities"
                    description="These activities are used only when the grand final ranking depends on an extra competition stage."
                    actions={
                      <Button size="small" startIcon={<AddRoundedIcon />} disabled={!editPolicy.canEditGrandFinal} onClick={() => patchWizardDraft((current) => ({
                        ...current,
                        configuration: {
                          ...current.configuration,
                          overallAdditionalActivities: [...current.configuration.overallAdditionalActivities, ""],
                        },
                      }))}>
                        Add activity
                      </Button>
                    }
                  >
                    <Stack spacing={1}>
                      {wizardDraft.configuration.overallAdditionalActivities.map((activity, activityIdx) => (
                        <Stack key={`grand-activity-${activityIdx}`} direction={{ xs: "column", md: "row" }} spacing={1}>
                          <TextField
                            label={`Activity ${activityIdx + 1}`}
                            value={activity}
                            disabled={!editPolicy.canEditGrandFinal}
                            onChange={(event) => patchWizardDraft((current) => {
                              const activities = [...current.configuration.overallAdditionalActivities];
                              activities[activityIdx] = event.target.value;
                              return {
                                ...current,
                                configuration: { ...current.configuration, overallAdditionalActivities: activities },
                              };
                            })}
                            fullWidth
                          />
                          <IconButton
                            color="error"
                            disabled={!editPolicy.canEditGrandFinal}
                            onClick={() => patchWizardDraft((current) => ({
                              ...current,
                              configuration: {
                                ...current.configuration,
                                overallAdditionalActivities: current.configuration.overallAdditionalActivities.filter((_, index) => index !== activityIdx),
                              },
                            }))}
                            sx={{ border: `1px solid ${brand.colors.line}`, alignSelf: { xs: "flex-end", md: "center" } }}
                          >
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      ))}
                    </Stack>
                  </SectionCard>
                ) : null}

                <SectionCard
                  title="Grand Final Awards"
                  description="Configure the final overall prizes."
                  actions={
                    <Button size="small" startIcon={<AddRoundedIcon />} disabled={!editPolicy.canEditGrandFinal} onClick={() => patchWizardDraft((current) => ({
                      ...current,
                      configuration: {
                        ...current.configuration,
                        overallAwards: [...current.configuration.overallAwards, createAwardDraft("", 1)],
                      },
                    }))}>
                      Add award
                    </Button>
                  }
                >
                  <Stack spacing={1}>
                    {wizardDraft.configuration.overallAwards.map((award, awardIdx) => (
                      <Stack key={`grand-award-${awardIdx}`} direction={{ xs: "column", md: "row" }} spacing={1}>
                        <TextField
                          label={`Award ${awardIdx + 1}`}
                          value={award.awardName}
                          disabled={!editPolicy.canEditGrandFinal}
                          onChange={(event) => patchWizardDraft((current) => {
                            const awards = [...current.configuration.overallAwards];
                            awards[awardIdx] = { ...awards[awardIdx], awardName: event.target.value };
                            return { ...current, configuration: { ...current.configuration, overallAwards: awards } };
                          })}
                          fullWidth
                        />
                        <TextField
                          label="Quantity"
                          type="number"
                          value={award.quantity}
                          disabled={!editPolicy.canEditGrandFinal}
                          onChange={(event) => patchWizardDraft((current) => {
                            const awards = [...current.configuration.overallAwards];
                            awards[awardIdx] = { ...awards[awardIdx], quantity: Math.max(1, Number(event.target.value || 1)) };
                            return { ...current, configuration: { ...current.configuration, overallAwards: awards } };
                          })}
                          inputProps={{ min: 1, step: 1 }}
                          sx={{ width: { xs: "100%", md: 140 } }}
                        />
                        <IconButton
                          color="error"
                          onClick={() => patchWizardDraft((current) => ({
                            ...current,
                            configuration: {
                              ...current.configuration,
                              overallAwards: current.configuration.overallAwards.filter((_, index) => index !== awardIdx),
                            },
                          }))}
                          disabled={!editPolicy.canEditGrandFinal || wizardDraft.configuration.overallAwards.length <= 1}
                          sx={{ border: `1px solid ${brand.colors.line}`, alignSelf: { xs: "flex-end", md: "center" } }}
                        >
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    ))}
                  </Stack>
                </SectionCard>
              </Stack>
            ) : (
              <Alert severity="info" variant="outlined">
                Grand Final is disabled. You can publish the event after all semester configurations are complete.
              </Alert>
            )}
          </Stack>
        </SectionCard>
        </Box>
      );
    }

    const summaryPayload = buildPayload(wizardDraft);
    return (
      <SectionCard
        title="Step 13: Publish Event"
        description="Review the generated semesters and publish only after all required pieces are complete."
      >
        <Stack spacing={1.3}>
          <Alert severity="info" variant="outlined">
            Event: <strong>{summaryPayload.event.name || "Unnamed event"}</strong><br />
            Semester range: <strong>{summaryPayload.configuration.startSemester || "N/A"}</strong>{" -> "}<strong>{summaryPayload.configuration.endSemester || "N/A"}</strong><br />
            Semesters configured: <strong>{summaryPayload.configuration.seasons.length}</strong><br />
            Grand Final: <strong>{summaryPayload.configuration.overallGrandFinalEnabled ? "Enabled" : "Disabled"}</strong>
          </Alert>
          <Typography sx={{ color: brand.colors.muted, fontSize: 13 }}>
            Saving as Draft keeps the event editable. Publishing saves it as <strong>Configured</strong> so the rest of the coordinator workflow can continue.
          </Typography>
        </Stack>
      </SectionCard>
    );
  };

  return (
    <Box>
      <ModulePageHeader
        eyebrow="Event Setup"
        title="Event Configuration"
        description="Create hackathon events with a semester-based wizard, then manage them from the list."
        actions={
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <ActionPill label={`${events.length} event${events.length === 1 ? "" : "s"}`} />
            <SecondaryActionButton onClick={fetchEvents}>Refresh</SecondaryActionButton>
            <PrimaryActionButton startIcon={<AddRoundedIcon />} onClick={() => openWizard("create")}>
              Create Event
            </PrimaryActionButton>
          </Stack>
        }
      />

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {loading ? (
        <Card sx={{ borderRadius: brand.radius.xl, border: `1px solid ${brand.colors.line}`, boxShadow: brand.shadow.sm }}>
          <CardContent sx={{ py: 4 }}>
            <Typography sx={{ color: brand.colors.muted }}>Loading events...</Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={1.6}>
          {events.length === 0 ? (
            <Card sx={{ borderRadius: brand.radius.xl, border: `1px solid ${brand.colors.line}`, boxShadow: brand.shadow.sm }}>
              <CardContent sx={{ py: 5 }}>
                <Typography sx={{ color: brand.colors.text, fontWeight: 900, fontSize: 18, mb: 0.6 }}>
                  No events yet
                </Typography>
                <Typography sx={{ color: brand.colors.muted, mb: 2 }}>
                  Start with the wizard to define the semester range, tracks, rounds, promotion rules, and awards.
                </Typography>
                <PrimaryActionButton startIcon={<AddRoundedIcon />} onClick={() => openWizard("create")}>
                  Create Event
                </PrimaryActionButton>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card sx={{ borderRadius: brand.radius.xl, border: `1px solid ${brand.colors.line}`, boxShadow: brand.shadow.sm }}>
                <CardContent sx={{ p: { xs: 2, md: 2.4 } }}>
                  <Stack spacing={1.5}>
                    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1}>
                      <Box>
                        <Typography sx={{ color: brand.colors.text, fontWeight: 950, fontSize: 22 }}>
                          Draft Events
                        </Typography>
                        <Typography sx={{ color: brand.colors.muted, fontSize: 14 }}>
                          Unpublished events that are still waiting for the final publish step.
                        </Typography>
                      </Box>
                      <ActionPill label={`${draftEvents.length} draft${draftEvents.length === 1 ? "" : "s"}`} />
                    </Stack>
                    {draftEvents.length ? (
                      <Stack spacing={1.2}>
                        {draftEvents.map((event) => (
                          <EventCardSummary
                            key={event.eventId}
                            event={event}
                            onEdit={() => {
                              window.dispatchEvent(new Event("seal-skip-next-search-guard"));
                              setSearchParams({ section: "event-config", eventId: String(event.eventId) }, { replace: true });
                              openWizard("edit", event);
                            }}
                            onDelete={() => deleteEvent(event.eventId)}
                          />
                        ))}
                      </Stack>
                    ) : (
                      <Alert severity="info" variant="outlined">
                        No draft events yet. Use Save Draft in the wizard to keep unfinished work here.
                      </Alert>
                    )}
                  </Stack>
                </CardContent>
              </Card>

              <Card sx={{ borderRadius: brand.radius.xl, border: `1px solid ${brand.colors.line}`, boxShadow: brand.shadow.sm }}>
                <CardContent sx={{ p: { xs: 2, md: 2.4 } }}>
                  <Stack spacing={1.5}>
                    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1}>
                      <Box>
                        <Typography sx={{ color: brand.colors.text, fontWeight: 950, fontSize: 22 }}>
                          Published and Active Events
                        </Typography>
                        <Typography sx={{ color: brand.colors.muted, fontSize: 14 }}>
                          Configured events that are ready for registration or later workflow stages.
                        </Typography>
                      </Box>
                      <ActionPill label={`${publishedEvents.length} event${publishedEvents.length === 1 ? "" : "s"}`} />
                    </Stack>
                    {publishedEvents.length ? (
                      <Stack spacing={1.2}>
                        {publishedEvents.map((event) => (
                          <EventCardSummary
                            key={event.eventId}
                            event={event}
                            onEdit={() => {
                              window.dispatchEvent(new Event("seal-skip-next-search-guard"));
                              setSearchParams({ section: "event-config", eventId: String(event.eventId) }, { replace: true });
                              openWizard("edit", event);
                            }}
                            onDelete={() => deleteEvent(event.eventId)}
                          />
                        ))}
                      </Stack>
                    ) : (
                      <Alert severity="info" variant="outlined">
                        No configured events yet.
                      </Alert>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </>
          )}
        </Stack>
      )}

      <Dialog open={wizardOpen} onClose={closeWizard} maxWidth="xl" fullWidth>
        <DialogTitle sx={{ pb: 1.2 }}>
          <Stack spacing={0.6}>
            <Typography sx={{ color: brand.colors.text, fontSize: 26, fontWeight: 950 }}>
              {wizardMode === "create" ? "Create Event Wizard" : "Edit Event Wizard"}
            </Typography>
            <Typography sx={{ color: brand.colors.muted, fontSize: 14 }}>
              Build the event step by step, from semester range generation through awards and optional grand final.
            </Typography>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ minHeight: { xs: 560, md: 700 }, maxHeight: "76vh", display: "flex", flexDirection: "column" }}>
          <Stack spacing={2}>
            <WizardProgress
              steps={WIZARD_STEPS}
              activeStep={wizardStep}
              maxAccessibleStep={maxAccessibleStep}
              stepStates={wizardStepStates}
              onStepSelect={selectWizardStep}
            />

            {wizardMode === "edit" && editPolicy.notice ? (
              <Alert severity={editPolicy.level === "locked" ? "warning" : "info"} variant="outlined">
                {editPolicy.notice}
              </Alert>
            ) : null}
            {wizardError ? <Alert severity={wizardError.startsWith("Draft saved") ? "success" : "error"}>{wizardError}</Alert> : null}
            {activeStepErrors.length ? (
              <Alert severity="warning" variant="outlined">
                {activeStepErrors[0].message}
              </Alert>
            ) : null}

            <Box sx={{ minHeight: { xs: 360, md: 470 }, maxHeight: { xs: 360, md: 470 }, overflowY: "auto", pr: 0.5 }}>
              {renderStepContent()}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.4, pt: 1.2 }}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.2} sx={{ width: "100%" }}>
            <Stack direction="row" spacing={1} justifyContent={{ xs: "flex-start", md: "flex-start" }}>
              {allowDraftSave ? (
                <SecondaryActionButton onClick={saveLocalDraft} disabled={saving}>
                  Save Draft
                </SecondaryActionButton>
              ) : null}
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="flex-end">
              <SecondaryActionButton onClick={closeWizard}>Cancel</SecondaryActionButton>
              <SecondaryActionButton onClick={() => moveStep(-1)} disabled={wizardStep === 0}>
                Back
              </SecondaryActionButton>
              {wizardStep < WIZARD_STEPS.length - 1 ? (
                <PrimaryActionButton endIcon={<ArrowForwardRoundedIcon />} onClick={() => moveStep(1)}>
                  Next
                </PrimaryActionButton>
              ) : (
                <>
                  {allowDraftSave ? (
                    <SecondaryActionButton onClick={() => saveWizard("Draft")} disabled={saving}>
                      {saving ? "Saving..." : "Save Event Draft"}
                    </SecondaryActionButton>
                  ) : null}
                  {editPolicy.canSubmitChanges ? (
                    <PrimaryActionButton
                      startIcon={<EmojiEventsRoundedIcon />}
                      onClick={() =>
                        saveWizard(
                          wizardMode === "edit" && normalizeEventStatus(wizardDraft.event.status) !== "DRAFT"
                            ? wizardDraft.event.status
                            : "Configured"
                        )
                      }
                      disabled={saving}
                    >
                      {saving
                        ? "Saving..."
                        : wizardMode === "edit" && normalizeEventStatus(wizardDraft.event.status) !== "DRAFT"
                          ? "Save Changes"
                          : "Publish Event"}
                    </PrimaryActionButton>
                  ) : null}
                </>
              )}
            </Stack>
          </Stack>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
