package com.seal.hackathon.event.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.seal.hackathon.common.ApiException;
import com.seal.hackathon.event.dto.EventConfigurationUpdateRequest;
import com.seal.hackathon.event.dto.EventManagementDto;
import com.seal.hackathon.event.dto.EventSetupCreateRequest;
import com.seal.hackathon.event.dto.EventStructureConfigDto;
import com.seal.hackathon.event.dto.EventUpsertRequest;
import com.seal.hackathon.event.dto.RoundManagementDto;
import com.seal.hackathon.event.dto.RoundUpsertRequest;
import com.seal.hackathon.event.dto.TrackDto;
import com.seal.hackathon.event.dto.TrackUpsertRequest;
import com.seal.hackathon.event.entity.EventStatus;
import com.seal.hackathon.event.entity.HackathonEventEntity;
import com.seal.hackathon.event.entity.RoundEntity;
import com.seal.hackathon.event.entity.TrackEntity;
import com.seal.hackathon.event.repository.HackathonEventRepository;
import com.seal.hackathon.event.repository.RoundRepository;
import com.seal.hackathon.event.repository.TrackRepository;
import com.seal.hackathon.team.repository.TeamRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class EventManagementService {

    private static final int MIN_TEAM_SIZE = 3;
    private static final int MAX_TEAM_SIZE = 5;
    private static final Pattern KEY_SANITIZER = Pattern.compile("[^a-z0-9]+");
    private static final List<String> SEASON_ORDER = List.of("Spring", "Summer", "Fall");
    private static final Set<String> ALLOWED_TRACK_SELECTION_MODES = Set.of("TEAM_SELECT", "SYSTEM_RANDOM");
    private static final Set<String> ALLOWED_FINAL_RANKING_MODES = Set.of("RANK_BY_SCORE", "ADDITIONAL_COMPETITION");
    private static final Set<String> ALLOWED_OVERALL_ELIGIBILITY = Set.of(
            "CHAMPION_ONLY",
            "TOP_3_EACH_SEMESTER",
            "ALL_AWARDED_TEAMS",
            "CUSTOM_RULE"
    );
    private static final Set<String> ALLOWED_OVERALL_METHODS = Set.of(
            "SUM_SCORES_ACROSS_SEMESTERS",
            "ADDITIONAL_GRAND_FINAL_COMPETITION"
    );

    private final HackathonEventRepository eventRepository;
    private final TrackRepository trackRepository;
    private final RoundRepository roundRepository;
    private final TeamRepository teamRepository;
    private final ObjectMapper objectMapper;

    public EventManagementService(HackathonEventRepository eventRepository,
                                  TrackRepository trackRepository,
                                  RoundRepository roundRepository,
                                  TeamRepository teamRepository,
                                  ObjectMapper objectMapper) {
        this.eventRepository = eventRepository;
        this.trackRepository = trackRepository;
        this.roundRepository = roundRepository;
        this.teamRepository = teamRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<EventManagementDto> listEvents() {
        return eventRepository.findAllByOrderByStartDateDescEventIdDesc()
                .stream()
                .map(this::toEventDto)
                .toList();
    }

    @Transactional
    public EventManagementDto createEvent(EventUpsertRequest request) {
        validateEventDateRange(request.startDate(), request.endDate());
        HackathonEventEntity event = new HackathonEventEntity();
        applyEventRequest(event, request, normalizeLegacySeasonSummary(request.season()), true);
        return toEventDto(eventRepository.save(event));
    }

    @Transactional
    public EventManagementDto createEventWithInitialConfiguration(EventSetupCreateRequest request) {
        EventStatus requestedStatus = EventStatus.from(request.event().status());
        EventStructureConfigDto configuration = requestedStatus == EventStatus.DRAFT
                ? normalizeDraftConfiguration(request.configuration())
                : normalizeAndValidateConfiguration(
                        request.configuration(),
                        request.event().startDate(),
                        request.event().endDate()
                );
        if (requestedStatus != EventStatus.DRAFT) {
            validateEventDateRange(request.event().startDate(), request.event().endDate());
            validateNoSemesterOverlap(configuration, null);
        }

        HackathonEventEntity event = new HackathonEventEntity();
        applyEventRequest(event, request.event(), buildSeasonSummary(configuration), true);
        event.setConfigurationJson(writeConfiguration(configuration));
        return toEventDto(eventRepository.save(event));
    }

    @Transactional
    public EventManagementDto updateEvent(Integer eventId, EventUpsertRequest request) {
        validateEventDateRange(request.startDate(), request.endDate());
        HackathonEventEntity event = getEventOrThrow(eventId);
        validateExistingRoundDeadlines(eventId, request.startDate(), request.endDate());
        applyEventRequest(event, request, normalizeLegacySeasonSummary(request.season()), false);
        return toEventDto(eventRepository.save(event));
    }

    @Transactional
    public EventManagementDto updateEventConfiguration(Integer eventId, EventConfigurationUpdateRequest request) {
        EventStatus requestedStatus = EventStatus.from(request.event().status());
        EventStructureConfigDto configuration = requestedStatus == EventStatus.DRAFT
                ? normalizeDraftConfiguration(request.configuration())
                : normalizeAndValidateConfiguration(
                        request.configuration(),
                        request.event().startDate(),
                        request.event().endDate()
                );
        if (requestedStatus != EventStatus.DRAFT) {
            validateEventDateRange(request.event().startDate(), request.event().endDate());
            validateNoSemesterOverlap(configuration, eventId);
        }

        HackathonEventEntity event = getEventOrThrow(eventId);
        applyEventRequestWithoutConfiguredReadiness(event, request.event(), buildSeasonSummary(configuration));
        event.setConfigurationJson(writeConfiguration(configuration));
        return toEventDto(eventRepository.save(event));
    }

    @Transactional
    public void deleteEvent(Integer eventId) {
        if (!eventRepository.existsById(eventId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Event not found");
        }
        if (teamRepository.countByEventId(eventId) > 0) {
            throw new ApiException(HttpStatus.CONFLICT, "Event cannot be deleted after teams have registered");
        }
        eventRepository.deleteById(eventId);
    }

    @Transactional(readOnly = true)
    public List<TrackDto> listTracks(Integer eventId) {
        ensureEventExists(eventId);
        return trackRepository.findByEventIdOrderByTrackIdAsc(eventId)
                .stream()
                .map(this::toTrackDto)
                .toList();
    }

    @Transactional
    public TrackDto createTrack(Integer eventId, TrackUpsertRequest request) {
        ensureEventExists(eventId);
        String trackName = request.name().trim();
        if (trackRepository.existsByEventIdAndNameIgnoreCase(eventId, trackName)) {
            throw new ApiException(HttpStatus.CONFLICT, "Track name already exists in this event");
        }

        TrackEntity track = new TrackEntity();
        track.setEventId(eventId);
        track.setName(trackName);
        return toTrackDto(trackRepository.save(track));
    }

    @Transactional
    public TrackDto updateTrack(Integer trackId, TrackUpsertRequest request) {
        TrackEntity track = trackRepository.findById(trackId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Track not found"));

        String nextName = request.name().trim();
        if (!track.getName().equalsIgnoreCase(nextName)
                && trackRepository.existsByEventIdAndNameIgnoreCase(track.getEventId(), nextName)) {
            throw new ApiException(HttpStatus.CONFLICT, "Track name already exists in this event");
        }
        track.setName(nextName);
        return toTrackDto(trackRepository.save(track));
    }

    @Transactional
    public void deleteTrack(Integer trackId) {
        TrackEntity track = trackRepository.findById(trackId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Track not found"));
        if (trackRepository.countByEventId(track.getEventId()) <= 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Each event must keep at least one track");
        }
        requireTrackHasNoTeams(track.getTrackId());
        trackRepository.deleteById(trackId);
    }

    @Transactional(readOnly = true)
    public List<RoundManagementDto> listRounds(Integer eventId) {
        ensureEventExists(eventId);
        return roundRepository.findByEventIdOrderByRoundOrderAsc(eventId)
                .stream()
                .map(this::toRoundDto)
                .toList();
    }

    @Transactional
    public RoundManagementDto createRound(Integer eventId, RoundUpsertRequest request) {
        HackathonEventEntity event = getEventOrThrow(eventId);
        validateLegacyRoundValues(request);
        validateSubmissionDeadlineWithinEvent(event.getStartDate(), event.getEndDate(), request.submissionDeadline());
        List<RoundEntity> existingRounds = roundRepository.findByEventIdOrderByRoundOrderAsc(eventId);
        validateRoundInsertPosition(request.roundOrder(), existingRounds.size() + 1);
        shiftRoundsForInsert(existingRounds, request.roundOrder());

        RoundEntity round = new RoundEntity();
        round.setEventId(eventId);
        applyRoundRequest(round, request);
        return toRoundDto(roundRepository.save(round));
    }

    @Transactional
    public RoundManagementDto updateRound(Integer roundId, RoundUpsertRequest request) {
        RoundEntity round = roundRepository.findById(roundId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Round not found"));
        HackathonEventEntity event = getEventOrThrow(round.getEventId());
        validateLegacyRoundValues(request);
        validateSubmissionDeadlineWithinEvent(event.getStartDate(), event.getEndDate(), request.submissionDeadline());
        List<RoundEntity> roundsInEvent = roundRepository.findByEventIdOrderByRoundOrderAsc(round.getEventId());
        validateRoundInsertPosition(request.roundOrder(), roundsInEvent.size());
        reorderRoundsForMove(roundsInEvent, roundId, request.roundOrder());
        applyRoundRequest(round, request);
        return toRoundDto(roundRepository.save(round));
    }

    @Transactional
    public RoundManagementDto updateRoundScoreLock(Integer roundId, Boolean scoreLocked) {
        if (scoreLocked == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "scoreLocked is required");
        }
        RoundEntity round = roundRepository.findById(roundId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Round not found"));
        round.setScoreLocked(scoreLocked);
        return toRoundDto(roundRepository.save(round));
    }

    @Transactional
    public void deleteRound(Integer roundId) {
        RoundEntity round = roundRepository.findById(roundId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Round not found"));
        if (roundRepository.countByEventId(round.getEventId()) <= 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Each event must keep at least one round");
        }
        Integer removedOrder = round.getRoundOrder();
        roundRepository.deleteById(roundId);
        List<RoundEntity> remainingRounds = roundRepository.findByEventIdOrderByRoundOrderAsc(round.getEventId());
        for (RoundEntity remaining : remainingRounds) {
            if (remaining.getRoundOrder() > removedOrder) {
                remaining.setRoundOrder(remaining.getRoundOrder() - 1);
                roundRepository.save(remaining);
            }
        }
    }

    private EventStructureConfigDto normalizeAndValidateConfiguration(EventStructureConfigDto configuration,
                                                                      LocalDate startDate,
                                                                      LocalDate endDate) {
        if (configuration == null || configuration.seasons() == null || configuration.seasons().isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Event must include at least one semester");
        }

        List<EventStructureConfigDto.SeasonConfigDto> orderedInputSeasons = configuration.seasons().stream()
                .sorted(Comparator
                        .comparingInt((EventStructureConfigDto.SeasonConfigDto season) -> season.year() == null ? Integer.MAX_VALUE : season.year())
                        .thenComparingInt(season -> seasonIndex(normalizeSeasonName(season.season()))))
                .toList();

        List<EventStructureConfigDto.SeasonConfigDto> normalizedSeasons = new ArrayList<>();
        SemesterRef previousSemester = null;

        for (EventStructureConfigDto.SeasonConfigDto season : orderedInputSeasons) {
            String normalizedSeasonName = normalizeSeasonName(season.season());
            Integer year = requirePositiveYear(season.year());
            SemesterRef currentSemester = new SemesterRef(normalizedSeasonName, year);

            if (previousSemester != null && !isNextSemester(previousSemester, currentSemester)) {
                throw new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "Selected semesters must be consecutive from start semester to end semester"
                );
            }
            previousSemester = currentSemester;

            LocalDate allowedStart = getSemesterStartDate(currentSemester);
            LocalDate allowedEnd = getSemesterEndDate(currentSemester);

            LocalDate registrationStartDate = requireDateWithinSemester(
                    season.registrationStartDate(),
                    allowedStart,
                    allowedEnd,
                    semesterLabel(currentSemester) + " registration start date must stay inside the semester range"
            );
            LocalDate registrationEndDate = requireDateWithinSemester(
                    season.registrationEndDate(),
                    allowedStart,
                    allowedEnd,
                    semesterLabel(currentSemester) + " registration end date must stay inside the semester range"
            );
            LocalDate competitionStartDate = requireDateWithinSemester(
                    season.competitionStartDate(),
                    allowedStart,
                    allowedEnd,
                    semesterLabel(currentSemester) + " competition start date must stay inside the semester range"
            );
            LocalDate competitionEndDate = requireDateWithinSemester(
                    season.competitionEndDate(),
                    allowedStart,
                    allowedEnd,
                    semesterLabel(currentSemester) + " competition end date must stay inside the semester range"
            );

            if (registrationStartDate.isAfter(registrationEndDate)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, semesterLabel(currentSemester) + " registration start date must be before or equal to registration end date");
            }
            if (registrationEndDate.isAfter(competitionStartDate)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, semesterLabel(currentSemester) + " registration end date must be before or equal to competition start date");
            }
            if (competitionStartDate.isAfter(competitionEndDate)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, semesterLabel(currentSemester) + " competition start date must be before or equal to competition end date");
            }

            String trackSelectionMode = normalizeTrackSelectionMode(season.trackSelectionMode());
            List<EventStructureConfigDto.TrackConfigDto> normalizedTracks = normalizeTracks(season.tracks(), currentSemester);
            Map<String, EventStructureConfigDto.TrackConfigDto> tracksByKey = normalizedTracks.stream().collect(Collectors.toMap(
                    EventStructureConfigDto.TrackConfigDto::trackKey,
                    track -> track,
                    (left, right) -> left,
                    LinkedHashMap::new
            ));

            List<EventStructureConfigDto.RoundStageConfigDto> normalizedRounds = normalizeRounds(
                    season.rounds(),
                    competitionStartDate,
                    competitionEndDate,
                    currentSemester
            );
            Map<String, EventStructureConfigDto.RoundStageConfigDto> roundsByKey = normalizedRounds.stream().collect(Collectors.toMap(
                    EventStructureConfigDto.RoundStageConfigDto::roundKey,
                    round -> round,
                    (left, right) -> left,
                    LinkedHashMap::new
            ));

            List<EventStructureConfigDto.PromotionRuleDto> normalizedPromotionRules = normalizePromotionRules(
                    season.promotionRules(),
                    tracksByKey,
                    roundsByKey,
                    currentSemester
            );

            String finalRankingMode = normalizeSeasonFinalRankingMode(season.finalRankingMode());
            List<String> additionalFinalActivities = "ADDITIONAL_COMPETITION".equals(finalRankingMode)
                    ? normalizeActivities(season.additionalFinalActivities(), "Add at least one additional final activity")
                    : List.of();

            List<EventStructureConfigDto.AwardConfigDto> normalizedAwards = normalizeAwards(
                    season.awards(),
                    "Semester " + semesterLabel(currentSemester) + " must include at least one award"
            );

            Integer finalEligibleTeams = estimateEligibleFinalTeams(normalizedRounds, normalizedPromotionRules);
            int totalAwardQuantity = normalizedAwards.stream().mapToInt(EventStructureConfigDto.AwardConfigDto::quantity).sum();
            if (finalEligibleTeams != null && totalAwardQuantity > finalEligibleTeams) {
                throw new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "Semester " + semesterLabel(currentSemester) + " has more award slots than eligible final teams"
                );
            }

            normalizedSeasons.add(new EventStructureConfigDto.SeasonConfigDto(
                    normalizedSeasonName,
                    year,
                    registrationStartDate,
                    registrationEndDate,
                    competitionStartDate,
                    competitionEndDate,
                    trackSelectionMode,
                    normalizedTracks,
                    normalizedRounds,
                    normalizedPromotionRules,
                    finalRankingMode,
                    additionalFinalActivities,
                    normalizedAwards
            ));
        }

        String derivedStartSemester = semesterLabel(toSemesterRef(normalizedSeasons.get(0)));
        String derivedEndSemester = semesterLabel(toSemesterRef(normalizedSeasons.get(normalizedSeasons.size() - 1)));
        String requestedStartSemester = configuration.startSemester() == null || configuration.startSemester().isBlank()
                ? derivedStartSemester
                : requireTrimmedValue(configuration.startSemester(), "Start semester is required");
        String requestedEndSemester = configuration.endSemester() == null || configuration.endSemester().isBlank()
                ? derivedEndSemester
                : requireTrimmedValue(configuration.endSemester(), "End semester is required");

        if (!requestedStartSemester.equalsIgnoreCase(derivedStartSemester)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Start semester does not match the generated semester range");
        }
        if (!requestedEndSemester.equalsIgnoreCase(derivedEndSemester)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "End semester does not match the generated semester range");
        }

        boolean overallGrandFinalEnabled = Boolean.TRUE.equals(configuration.overallGrandFinalEnabled());
        LocalDate overallGrandFinalStartDate = null;
        LocalDate overallGrandFinalEndDate = null;
        if (overallGrandFinalEnabled) {
            LocalDate lastSeasonRangeStart = normalizedSeasons.stream()
                    .map(EventStructureConfigDto.SeasonConfigDto::competitionEndDate)
                    .filter(Objects::nonNull)
                    .max(LocalDate::compareTo)
                    .orElse(getSemesterStartDate(toSemesterRef(normalizedSeasons.get(normalizedSeasons.size() - 1))));
            LocalDate lastSeasonRangeEnd = getSemesterEndDate(toSemesterRef(normalizedSeasons.get(normalizedSeasons.size() - 1)));
            overallGrandFinalStartDate = requireDateWithinRange(
                    configuration.overallGrandFinalStartDate(),
                    lastSeasonRangeStart,
                    lastSeasonRangeEnd,
                    "Grand final start date must stay inside the final semester window"
            );
            overallGrandFinalEndDate = requireDateWithinRange(
                    configuration.overallGrandFinalEndDate(),
                    lastSeasonRangeStart,
                    lastSeasonRangeEnd,
                    "Grand final end date must stay inside the final semester window"
            );
            if (overallGrandFinalStartDate.isAfter(overallGrandFinalEndDate)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Grand final start date must be before or equal to end date");
            }
        }
        String overallGrandFinalEligibility = overallGrandFinalEnabled
                ? normalizeOverallGrandFinalEligibility(configuration.overallGrandFinalEligibility())
                : null;
        String overallGrandFinalMethod = overallGrandFinalEnabled
                ? normalizeOverallGrandFinalMethod(configuration.overallGrandFinalMethod())
                : null;
        List<String> overallAdditionalActivities = overallGrandFinalEnabled
                && "ADDITIONAL_GRAND_FINAL_COMPETITION".equals(overallGrandFinalMethod)
                ? normalizeActivities(configuration.overallAdditionalActivities(), "Add at least one grand final activity")
                : List.of();
        List<EventStructureConfigDto.AwardConfigDto> overallAwards = overallGrandFinalEnabled
                ? normalizeAwards(configuration.overallAwards(), "Overall grand final must include at least one award")
                : List.of();

        return new EventStructureConfigDto(
                derivedStartSemester,
                derivedEndSemester,
                normalizedSeasons,
                overallGrandFinalEnabled,
                overallGrandFinalStartDate,
                overallGrandFinalEndDate,
                overallGrandFinalEligibility,
                overallGrandFinalMethod,
                overallAdditionalActivities,
                overallAwards
        );
    }

    private EventStructureConfigDto normalizeDraftConfiguration(EventStructureConfigDto configuration) {
        List<SemesterRef> semesterRange = normalizeDraftSemesterRange(configuration);

        Map<String, EventStructureConfigDto.SeasonConfigDto> existingSeasonsByLabel = new LinkedHashMap<>();
        if (configuration != null && configuration.seasons() != null) {
            for (EventStructureConfigDto.SeasonConfigDto season : configuration.seasons()) {
                if (season == null || season.season() == null || season.year() == null) {
                    continue;
                }
                SemesterRef ref = new SemesterRef(normalizeSeasonName(season.season()), requirePositiveYear(season.year()));
                existingSeasonsByLabel.put(semesterLabel(ref), season);
            }
        }

        List<EventStructureConfigDto.SeasonConfigDto> normalizedSeasons = semesterRange.stream()
                .map(ref -> {
                    EventStructureConfigDto.SeasonConfigDto season = existingSeasonsByLabel.get(semesterLabel(ref));
                    return new EventStructureConfigDto.SeasonConfigDto(
                            ref.season(),
                            ref.year(),
                            season == null ? null : season.registrationStartDate(),
                            season == null ? null : season.registrationEndDate(),
                            season == null ? null : season.competitionStartDate(),
                            season == null ? null : season.competitionEndDate(),
                            normalizeOptionalTrackSelectionMode(season == null ? null : season.trackSelectionMode()),
                            normalizeDraftTracks(season == null ? null : season.tracks()),
                            normalizeDraftRounds(season == null ? null : season.rounds()),
                            normalizeDraftPromotionRules(season == null ? null : season.promotionRules()),
                            normalizeOptionalSeasonFinalRankingMode(season == null ? null : season.finalRankingMode()),
                            normalizeDraftActivities(season == null ? null : season.additionalFinalActivities()),
                            normalizeDraftAwards(season == null ? null : season.awards())
                    );
                })
                .toList();

        boolean overallGrandFinalEnabled = configuration != null && Boolean.TRUE.equals(configuration.overallGrandFinalEnabled());
        return new EventStructureConfigDto(
                semesterLabel(semesterRange.get(0)),
                semesterLabel(semesterRange.get(semesterRange.size() - 1)),
                normalizedSeasons,
                overallGrandFinalEnabled,
                overallGrandFinalEnabled ? configuration.overallGrandFinalStartDate() : null,
                overallGrandFinalEnabled ? configuration.overallGrandFinalEndDate() : null,
                overallGrandFinalEnabled
                        ? normalizeOptionalOverallGrandFinalEligibility(configuration.overallGrandFinalEligibility())
                        : null,
                overallGrandFinalEnabled
                        ? normalizeOptionalOverallGrandFinalMethod(configuration.overallGrandFinalMethod())
                        : null,
                overallGrandFinalEnabled
                        ? normalizeDraftActivities(configuration.overallAdditionalActivities())
                        : List.of(),
                overallGrandFinalEnabled
                        ? normalizeDraftAwards(configuration.overallAwards())
                        : List.of()
        );
    }

    private List<SemesterRef> normalizeDraftSemesterRange(EventStructureConfigDto configuration) {
        SemesterRef parsedStart = safeParseSemesterLabel(configuration == null ? null : configuration.startSemester());
        SemesterRef parsedEnd = safeParseSemesterLabel(configuration == null ? null : configuration.endSemester());

        List<SemesterRef> validSeasonRefs = new ArrayList<>();
        if (configuration != null && configuration.seasons() != null) {
            for (EventStructureConfigDto.SeasonConfigDto season : configuration.seasons()) {
                if (season == null) {
                    continue;
                }
                try {
                    validSeasonRefs.add(new SemesterRef(
                            normalizeSeasonName(season.season()),
                            requirePositiveYear(season.year())
                    ));
                } catch (ApiException ignored) {
                    // Draft mode accepts incomplete semester values.
                }
            }
        }
        validSeasonRefs = validSeasonRefs.stream().distinct().sorted(this::compareSemesterRefs).toList();

        SemesterRef fallback = parsedStart;
        if (fallback == null) {
            fallback = parsedEnd;
        }
        if (fallback == null && !validSeasonRefs.isEmpty()) {
            fallback = validSeasonRefs.get(0);
        }
        if (fallback == null) {
            fallback = new SemesterRef("Spring", LocalDate.now().getYear());
        }

        SemesterRef start = parsedStart == null ? (!validSeasonRefs.isEmpty() ? validSeasonRefs.get(0) : fallback) : parsedStart;
        SemesterRef end = parsedEnd == null ? (!validSeasonRefs.isEmpty() ? validSeasonRefs.get(validSeasonRefs.size() - 1) : fallback) : parsedEnd;

        if (compareSemesterRefs(start, end) > 0) {
            end = start;
        }

        return buildConsecutiveSemesterRange(start, end);
    }

    private List<EventStructureConfigDto.TrackConfigDto> normalizeTracks(List<EventStructureConfigDto.TrackConfigDto> tracks,
                                                                         SemesterRef semester) {
        if (tracks == null || tracks.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, semesterLabel(semester) + " must include at least one track");
        }

        Set<String> trackNames = new HashSet<>();
        Set<String> trackKeys = new HashSet<>();
        List<EventStructureConfigDto.TrackConfigDto> normalizedTracks = new ArrayList<>();

        for (int index = 0; index < tracks.size(); index += 1) {
            EventStructureConfigDto.TrackConfigDto track = tracks.get(index);
            String trackName = requireTrimmedValue(track.name(), "Track name is required");
            String trackKey = normalizeKey(track.trackKey(), trackName, "track", index + 1);

            if (!trackNames.add(trackName.toLowerCase(Locale.ROOT))) {
                throw new ApiException(HttpStatus.BAD_REQUEST, semesterLabel(semester) + " cannot contain duplicate track names");
            }
            if (!trackKeys.add(trackKey)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, semesterLabel(semester) + " contains duplicate track keys");
            }

            normalizedTracks.add(new EventStructureConfigDto.TrackConfigDto(
                    trackKey,
                    trackName,
                    track.description() == null ? null : track.description().trim()
            ));
        }
        return normalizedTracks;
    }

    private List<EventStructureConfigDto.RoundStageConfigDto> normalizeRounds(
            List<EventStructureConfigDto.RoundStageConfigDto> rounds,
            LocalDate competitionStartDate,
            LocalDate competitionEndDate,
            SemesterRef semester) {
        if (rounds == null || rounds.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, semesterLabel(semester) + " must include at least one round");
        }

        List<EventStructureConfigDto.RoundStageConfigDto> orderedRounds = rounds.stream()
                .sorted(Comparator.comparingInt(round -> round.roundOrder() == null ? Integer.MAX_VALUE : round.roundOrder()))
                .toList();

        List<EventStructureConfigDto.RoundStageConfigDto> normalizedRounds = new ArrayList<>();
        Set<String> roundKeys = new HashSet<>();
        int finalRoundCount = 0;

        for (int index = 0; index < orderedRounds.size(); index += 1) {
            EventStructureConfigDto.RoundStageConfigDto round = orderedRounds.get(index);
            int expectedOrder = index + 1;
            if (round.roundOrder() == null || round.roundOrder() != expectedOrder) {
                throw new ApiException(HttpStatus.BAD_REQUEST, semesterLabel(semester) + " round order must start at 1 and remain consecutive");
            }

            String roundName = requireTrimmedValue(round.roundName(), "Round name is required");
            String roundKey = normalizeKey(round.roundKey(), roundName, "round", index + 1);
            if (!roundKeys.add(roundKey)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, semesterLabel(semester) + " contains duplicate round keys");
            }

            LocalDate roundStartDate = requireDateWithinRange(
                    round.startDate(),
                    competitionStartDate,
                    competitionEndDate,
                    roundName + " start date must stay inside the semester competition range"
            );
            LocalDate roundEndDate = requireDateWithinRange(
                    round.endDate(),
                    competitionStartDate,
                    competitionEndDate,
                    roundName + " end date must stay inside the semester competition range"
            );
            if (roundStartDate.isAfter(roundEndDate)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, roundName + " start date must be before or equal to end date");
            }

            if (index > 0) {
                EventStructureConfigDto.RoundStageConfigDto previousNormalizedRound = normalizedRounds.get(index - 1);
                if (!roundStartDate.isAfter(previousNormalizedRound.endDate())) {
                    throw new ApiException(
                            HttpStatus.BAD_REQUEST,
                            roundName + " must start after " + previousNormalizedRound.roundName() + " ends"
                    );
                }
                if (!roundEndDate.isAfter(previousNormalizedRound.endDate())) {
                    throw new ApiException(
                            HttpStatus.BAD_REQUEST,
                            roundName + " must end after " + previousNormalizedRound.roundName() + " ends"
                    );
                }
            }

            boolean finalRound = Boolean.TRUE.equals(round.finalRound());
            if (finalRound) {
                finalRoundCount += 1;
                if (index != orderedRounds.size() - 1) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "The final round must be the last round by order");
                }
            }

            normalizedRounds.add(new EventStructureConfigDto.RoundStageConfigDto(
                    roundKey,
                    roundName,
                    expectedOrder,
                    roundStartDate,
                    roundEndDate,
                    finalRound
            ));
        }

        if (finalRoundCount != 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, semesterLabel(semester) + " must have exactly one final round");
        }

        return normalizedRounds;
    }

    private List<EventStructureConfigDto.PromotionRuleDto> normalizePromotionRules(
            List<EventStructureConfigDto.PromotionRuleDto> rules,
            Map<String, EventStructureConfigDto.TrackConfigDto> tracksByKey,
            Map<String, EventStructureConfigDto.RoundStageConfigDto> roundsByKey,
            SemesterRef semester) {
        if (rules == null || rules.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, semesterLabel(semester) + " must include promotion rules");
        }

        Map<String, EventStructureConfigDto.RoundStageConfigDto> nonFinalRounds = roundsByKey.values().stream()
                .filter(round -> !Boolean.TRUE.equals(round.finalRound()))
                .collect(Collectors.toMap(
                        EventStructureConfigDto.RoundStageConfigDto::roundKey,
                        round -> round,
                        (left, right) -> left,
                        LinkedHashMap::new
                ));

        Set<String> dedupe = new HashSet<>();
        List<EventStructureConfigDto.PromotionRuleDto> normalizedRules = new ArrayList<>();

        for (EventStructureConfigDto.PromotionRuleDto rule : rules) {
            String trackKey = requireTrimmedValue(rule.trackKey(), "Track key is required for promotion rules").toLowerCase(Locale.ROOT);
            String fromRoundKey = requireTrimmedValue(rule.fromRoundKey(), "From round is required").toLowerCase(Locale.ROOT);
            String toRoundKey = requireTrimmedValue(rule.toRoundKey(), "To round is required").toLowerCase(Locale.ROOT);
            Integer topN = rule.topN();

            if (!tracksByKey.containsKey(trackKey)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Promotion rule references an unknown track");
            }
            if (!roundsByKey.containsKey(fromRoundKey) || !roundsByKey.containsKey(toRoundKey)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Promotion rule references an unknown round");
            }
            EventStructureConfigDto.RoundStageConfigDto fromRound = roundsByKey.get(fromRoundKey);
            EventStructureConfigDto.RoundStageConfigDto toRound = roundsByKey.get(toRoundKey);
            if (Boolean.TRUE.equals(fromRound.finalRound())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "The final round cannot promote to another round");
            }
            if (fromRound.roundOrder() >= toRound.roundOrder()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Promotion rules must advance from an earlier round to a later round");
            }
            if (toRound.roundOrder() != fromRound.roundOrder() + 1) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Promotion rules must point to the next round in sequence");
            }
            if (topN == null || topN < 1) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Top N must be greater than 0");
            }

            String ruleKey = trackKey + "::" + fromRoundKey + "::" + toRoundKey;
            if (!dedupe.add(ruleKey)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Duplicate promotion rule detected");
            }

            normalizedRules.add(new EventStructureConfigDto.PromotionRuleDto(trackKey, fromRoundKey, toRoundKey, topN));
        }

        for (String trackKey : tracksByKey.keySet()) {
            for (String roundKey : nonFinalRounds.keySet()) {
                long matchingRules = normalizedRules.stream()
                        .filter(rule -> rule.trackKey().equals(trackKey) && rule.fromRoundKey().equals(roundKey))
                        .count();
                if (matchingRules != 1) {
                    throw new ApiException(
                            HttpStatus.BAD_REQUEST,
                            semesterLabel(semester) + " must define exactly one promotion rule for every track and every non-final round"
                    );
                }
            }
        }

        return normalizedRules;
    }

    private List<EventStructureConfigDto.AwardConfigDto> normalizeAwards(List<EventStructureConfigDto.AwardConfigDto> awards,
                                                                         String emptyMessage) {
        if (awards == null || awards.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, emptyMessage);
        }

        Set<String> names = new HashSet<>();
        List<EventStructureConfigDto.AwardConfigDto> normalizedAwards = new ArrayList<>();
        for (EventStructureConfigDto.AwardConfigDto award : awards) {
            String awardName = requireTrimmedValue(award.awardName(), "Award name is required");
            if (award.quantity() == null || award.quantity() < 1) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Award quantity must be at least 1");
            }
            if (!names.add(awardName.toLowerCase(Locale.ROOT))) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Award names must be unique inside the same list");
            }
            normalizedAwards.add(new EventStructureConfigDto.AwardConfigDto(awardName, award.quantity()));
        }
        return normalizedAwards;
    }

    private void validateLegacyRoundValues(RoundUpsertRequest request) {
        if (request.roundOrder() == null || request.roundOrder() < 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Round order must be at least 1");
        }
        if (request.promotionRuleTopN() == null || request.promotionRuleTopN() < 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Top N teams per track must be at least 1");
        }
    }

    private void validateRoundInsertPosition(Integer requestedOrder, int maxAllowedOrder) {
        if (requestedOrder == null || requestedOrder < 1 || requestedOrder > maxAllowedOrder) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "Round order must start at 1 and stay consecutive within the event sequence"
            );
        }
    }

    private void shiftRoundsForInsert(List<RoundEntity> rounds, Integer requestedOrder) {
        List<RoundEntity> affectedRounds = rounds.stream()
                .filter(existing -> existing.getRoundOrder() >= requestedOrder)
                .sorted(Comparator.comparing(RoundEntity::getRoundOrder).reversed())
                .toList();
        for (RoundEntity existing : affectedRounds) {
            existing.setRoundOrder(existing.getRoundOrder() + 1);
            roundRepository.save(existing);
        }
        if (!affectedRounds.isEmpty()) {
            roundRepository.flush();
        }
    }

    private void reorderRoundsForMove(List<RoundEntity> roundsInEvent, Integer roundId, Integer targetOrder) {
        RoundEntity movingRound = roundsInEvent.stream()
                .filter(existing -> existing.getRoundId().equals(roundId))
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Round not found"));

        int currentOrder = movingRound.getRoundOrder();
        if (currentOrder == targetOrder) {
            return;
        }

        movingRound.setRoundOrder(0);
        roundRepository.saveAndFlush(movingRound);

        if (targetOrder < currentOrder) {
            for (RoundEntity existing : roundsInEvent) {
                if (!existing.getRoundId().equals(roundId)
                        && existing.getRoundOrder() >= targetOrder
                        && existing.getRoundOrder() < currentOrder) {
                    existing.setRoundOrder(existing.getRoundOrder() + 1);
                    roundRepository.save(existing);
                }
            }
            roundRepository.flush();
            return;
        }

        for (RoundEntity existing : roundsInEvent) {
            if (!existing.getRoundId().equals(roundId)
                    && existing.getRoundOrder() <= targetOrder
                    && existing.getRoundOrder() > currentOrder) {
                existing.setRoundOrder(existing.getRoundOrder() - 1);
                roundRepository.save(existing);
            }
        }
        roundRepository.flush();
    }

    private void ensureEventExists(Integer eventId) {
        if (!eventRepository.existsById(eventId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Event not found");
        }
    }

    private HackathonEventEntity getEventOrThrow(Integer eventId) {
        return eventRepository.findById(eventId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Event not found"));
    }

    private void validateEventDateRange(LocalDate startDate, LocalDate endDate) {
        if (startDate == null || endDate == null || !endDate.isAfter(startDate)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "End date must be after start date");
        }
    }

    private void validateSubmissionDeadlineWithinEvent(LocalDate startDate,
                                                       LocalDate endDate,
                                                       LocalDateTime submissionDeadline) {
        LocalDate submissionDate = submissionDeadline.toLocalDate();
        if (submissionDate.isBefore(startDate) || submissionDate.isAfter(endDate)) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "Submission deadline must be within the event start and end dates"
            );
        }
    }

    private void validateExistingRoundDeadlines(Integer eventId, LocalDate startDate, LocalDate endDate) {
        for (RoundEntity round : roundRepository.findByEventIdOrderByRoundOrderAsc(eventId)) {
            validateSubmissionDeadlineWithinEvent(startDate, endDate, round.getSubmissionDeadline());
        }
    }

    private void applyEventRequest(HackathonEventEntity event,
                                   EventUpsertRequest request,
                                   String seasonSummary,
                                   boolean creating) {
        EventStatus nextStatus = EventStatus.from(request.status());
        if (creating && nextStatus != EventStatus.DRAFT && nextStatus != EventStatus.CONFIGURED) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "New event must start in Draft or Configured status");
        }
        if (!creating) {
            validateStatusTransition(event, nextStatus);
        }
        if (!creating && nextStatus == EventStatus.CONFIGURED) {
            validateConfiguredReadiness(event.getEventId());
        }

        event.setName(requireTrimmedValue(request.name(), "Event name is required"));
        event.setSeason(seasonSummary);
        event.setYear(request.year());
        event.setStartDate(request.startDate());
        event.setEndDate(request.endDate());
        event.setStatus(nextStatus.getDbValue());
        event.setDescription(request.description() == null ? null : request.description().trim());
    }

    private void applyEventRequestWithoutConfiguredReadiness(HackathonEventEntity event,
                                                             EventUpsertRequest request,
                                                             String seasonSummary) {
        EventStatus nextStatus = EventStatus.from(request.status());
        validateStatusTransition(event, nextStatus);

        event.setName(requireTrimmedValue(request.name(), "Event name is required"));
        event.setSeason(seasonSummary);
        event.setYear(request.year());
        event.setStartDate(request.startDate());
        event.setEndDate(request.endDate());
        event.setStatus(nextStatus.getDbValue());
        event.setDescription(request.description() == null ? null : request.description().trim());
    }

    private String normalizeLegacySeasonSummary(String rawSeason) {
        String value = requireTrimmedValue(rawSeason, "Season is required");
        if (value.length() > 40) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Season summary is too long");
        }
        return value;
    }

    private String normalizeSeasonName(String rawSeason) {
        String value = requireTrimmedValue(rawSeason, "Season name is required");
        return SEASON_ORDER.stream()
                .filter(allowed -> allowed.equalsIgnoreCase(value))
                .findFirst()
                .orElseThrow(() -> new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "Season must be one of: Spring, Summer, Fall"
                ));
    }

    private int seasonIndex(String seasonName) {
        int index = SEASON_ORDER.indexOf(seasonName);
        return index >= 0 ? index : Integer.MAX_VALUE;
    }

    private Integer requirePositiveYear(Integer year) {
        if (year == null || year < 2020 || year > 2100) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Semester year must be between 2020 and 2100");
        }
        return year;
    }

    private LocalDate getSemesterStartDate(SemesterRef semester) {
        return switch (semester.season()) {
            case "Spring" -> LocalDate.of(semester.year(), 1, 1);
            case "Summer" -> LocalDate.of(semester.year(), 5, 1);
            case "Fall" -> LocalDate.of(semester.year(), 9, 1);
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported semester");
        };
    }

    private LocalDate getSemesterEndDate(SemesterRef semester) {
        return switch (semester.season()) {
            case "Spring" -> LocalDate.of(semester.year(), 4, 30);
            case "Summer" -> LocalDate.of(semester.year(), 8, 31);
            case "Fall" -> LocalDate.of(semester.year(), 12, 31);
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported semester");
        };
    }

    private boolean isNextSemester(SemesterRef previous, SemesterRef current) {
        int previousIndex = seasonIndex(previous.season());
        int currentIndex = seasonIndex(current.season());
        if (previousIndex == SEASON_ORDER.size() - 1) {
            return current.year() == previous.year() + 1 && currentIndex == 0;
        }
        return current.year().equals(previous.year()) && currentIndex == previousIndex + 1;
    }

    private String semesterLabel(SemesterRef semester) {
        return semester.season() + " " + semester.year();
    }

    private SemesterRef toSemesterRef(EventStructureConfigDto.SeasonConfigDto season) {
        return new SemesterRef(season.season(), season.year());
    }

    private LocalDate requireDateWithinSemester(LocalDate value,
                                                LocalDate allowedStart,
                                                LocalDate allowedEnd,
                                                String errorMessage) {
        return requireDateWithinRange(value, allowedStart, allowedEnd, errorMessage);
    }

    private LocalDate requireDateWithinRange(LocalDate value,
                                             LocalDate rangeStart,
                                             LocalDate rangeEnd,
                                             String errorMessage) {
        if (value == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, errorMessage);
        }
        if (value.isBefore(rangeStart) || value.isAfter(rangeEnd)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, errorMessage);
        }
        return value;
    }

    private String buildSeasonSummary(EventStructureConfigDto configuration) {
        return configuration.seasons().stream()
                .map(EventStructureConfigDto.SeasonConfigDto::season)
                .sorted(Comparator.comparingInt(this::seasonIndex))
                .collect(Collectors.joining("+"));
    }

    private String normalizeTrackSelectionMode(String rawMode) {
        String normalized = requireTrimmedValue(rawMode, "Track selection mode is required")
                .toUpperCase(Locale.ROOT);
        if (!ALLOWED_TRACK_SELECTION_MODES.contains(normalized)) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "Track selection mode must be TEAM_SELECT or SYSTEM_RANDOM"
            );
        }
        return normalized;
    }

    private String normalizeOptionalTrackSelectionMode(String rawMode) {
        if (rawMode == null || rawMode.isBlank()) {
            return "TEAM_SELECT";
        }
        return normalizeTrackSelectionMode(rawMode);
    }

    private String normalizeOverallGrandFinalEligibility(String rawEligibility) {
        String normalized = requireTrimmedValue(rawEligibility, "Grand final eligibility is required")
                .toUpperCase(Locale.ROOT);
        if (!ALLOWED_OVERALL_ELIGIBILITY.contains(normalized)) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "Grand final eligibility must be one of: CHAMPION_ONLY, TOP_3_EACH_SEMESTER, ALL_AWARDED_TEAMS, CUSTOM_RULE"
            );
        }
        return normalized;
    }

    private String normalizeOptionalOverallGrandFinalEligibility(String rawEligibility) {
        if (rawEligibility == null || rawEligibility.isBlank()) {
            return "CHAMPION_ONLY";
        }
        return normalizeOverallGrandFinalEligibility(rawEligibility);
    }

    private String normalizeOverallGrandFinalMethod(String rawMethod) {
        String normalized = requireTrimmedValue(rawMethod, "Grand final ranking method is required")
                .toUpperCase(Locale.ROOT);
        if (!ALLOWED_OVERALL_METHODS.contains(normalized)) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "Grand final ranking method must be one of: SUM_SCORES_ACROSS_SEMESTERS, ADDITIONAL_GRAND_FINAL_COMPETITION"
            );
        }
        return normalized;
    }

    private String normalizeOptionalOverallGrandFinalMethod(String rawMethod) {
        if (rawMethod == null || rawMethod.isBlank()) {
            return "SUM_SCORES_ACROSS_SEMESTERS";
        }
        return normalizeOverallGrandFinalMethod(rawMethod);
    }

    private String normalizeSeasonFinalRankingMode(String rawMode) {
        String normalized = requireTrimmedValue(rawMode, "Final round ranking mode is required")
                .toUpperCase(Locale.ROOT);
        if (!ALLOWED_FINAL_RANKING_MODES.contains(normalized)) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "Final round ranking mode must be RANK_BY_SCORE or ADDITIONAL_COMPETITION"
            );
        }
        return normalized;
    }

    private String normalizeOptionalSeasonFinalRankingMode(String rawMode) {
        if (rawMode == null || rawMode.isBlank()) {
            return "RANK_BY_SCORE";
        }
        return normalizeSeasonFinalRankingMode(rawMode);
    }

    private List<EventStructureConfigDto.TrackConfigDto> normalizeDraftTracks(List<EventStructureConfigDto.TrackConfigDto> tracks) {
        if (tracks == null) {
            return List.of();
        }
        return tracks.stream()
                .filter(Objects::nonNull)
                .map(track -> new EventStructureConfigDto.TrackConfigDto(
                        track.trackKey(),
                        track.name(),
                        track.description()
                ))
                .toList();
    }

    private List<EventStructureConfigDto.RoundStageConfigDto> normalizeDraftRounds(List<EventStructureConfigDto.RoundStageConfigDto> rounds) {
        if (rounds == null) {
            return List.of();
        }
        return rounds.stream()
                .filter(Objects::nonNull)
                .sorted(Comparator.comparingInt(round -> round.roundOrder() == null ? Integer.MAX_VALUE : round.roundOrder()))
                .toList();
    }

    private List<EventStructureConfigDto.PromotionRuleDto> normalizeDraftPromotionRules(List<EventStructureConfigDto.PromotionRuleDto> rules) {
        if (rules == null) {
            return List.of();
        }
        return rules.stream()
                .filter(Objects::nonNull)
                .toList();
    }

    private List<EventStructureConfigDto.AwardConfigDto> normalizeDraftAwards(List<EventStructureConfigDto.AwardConfigDto> awards) {
        if (awards == null) {
            return List.of();
        }
        return awards.stream()
                .filter(Objects::nonNull)
                .toList();
    }

    private List<String> normalizeDraftActivities(List<String> activities) {
        if (activities == null) {
            return List.of();
        }
        return activities.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();
    }

    private List<String> normalizeActivities(List<String> activities, String emptyMessage) {
        if (activities == null || activities.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, emptyMessage);
        }
        List<String> normalized = activities.stream()
                .map(activity -> requireTrimmedValue(activity, "Activity name is required"))
                .distinct()
                .toList();
        if (normalized.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, emptyMessage);
        }
        return normalized;
    }

    private Integer estimateEligibleFinalTeams(List<EventStructureConfigDto.RoundStageConfigDto> rounds,
                                               List<EventStructureConfigDto.PromotionRuleDto> promotionRules) {
        EventStructureConfigDto.RoundStageConfigDto finalRound = rounds.stream()
                .filter(round -> Boolean.TRUE.equals(round.finalRound()))
                .findFirst()
                .orElse(null);
        if (finalRound == null) {
            return null;
        }
        int eligibleTeams = promotionRules.stream()
                .filter(rule -> rule.toRoundKey().equals(finalRound.roundKey()))
                .mapToInt(EventStructureConfigDto.PromotionRuleDto::topN)
                .sum();
        return eligibleTeams > 0 ? eligibleTeams : null;
    }

    private List<SemesterRef> normalizeSemesterRange(String rawStartSemester,
                                                     String rawEndSemester,
                                                     List<EventStructureConfigDto.SeasonConfigDto> seasons) {
        if (rawStartSemester != null && !rawStartSemester.isBlank()
                && rawEndSemester != null && !rawEndSemester.isBlank()) {
            SemesterRef start = parseSemesterLabel(rawStartSemester, "Start semester is required");
            SemesterRef end = parseSemesterLabel(rawEndSemester, "End semester is required");
            if (compareSemesterRefs(start, end) > 0) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "End semester must not be before start semester");
            }
            return buildConsecutiveSemesterRange(start, end);
        }

        if (seasons == null || seasons.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Event must include at least one semester");
        }

        List<SemesterRef> orderedSemesters = seasons.stream()
                .filter(Objects::nonNull)
                .map(season -> new SemesterRef(
                        normalizeSeasonName(season.season()),
                        requirePositiveYear(season.year())
                ))
                .distinct()
                .sorted(this::compareSemesterRefs)
                .toList();

        if (orderedSemesters.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Event must include at least one semester");
        }

        for (int index = 1; index < orderedSemesters.size(); index += 1) {
            if (!isNextSemester(orderedSemesters.get(index - 1), orderedSemesters.get(index))) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Selected semesters must be consecutive from start semester to end semester");
            }
        }
        return orderedSemesters;
    }

    private SemesterRef parseSemesterLabel(String rawValue, String errorMessage) {
        String value = requireTrimmedValue(rawValue, errorMessage);
        String[] parts = value.split("\\s+");
        if (parts.length != 2) {
            throw new ApiException(HttpStatus.BAD_REQUEST, errorMessage);
        }
        String season = normalizeSeasonName(parts[0]);
        Integer year;
        try {
            year = Integer.valueOf(parts[1]);
        } catch (NumberFormatException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, errorMessage);
        }
        return new SemesterRef(season, requirePositiveYear(year));
    }

    private SemesterRef safeParseSemesterLabel(String rawValue) {
        try {
            return parseSemesterLabel(rawValue, "Semester value is invalid");
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private int compareSemesterRefs(SemesterRef left, SemesterRef right) {
        if (!Objects.equals(left.year(), right.year())) {
            return left.year().compareTo(right.year());
        }
        return Integer.compare(seasonIndex(left.season()), seasonIndex(right.season()));
    }

    private List<SemesterRef> buildConsecutiveSemesterRange(SemesterRef start, SemesterRef end) {
        List<SemesterRef> semesters = new ArrayList<>();
        SemesterRef current = start;
        while (compareSemesterRefs(current, end) <= 0) {
            semesters.add(current);
            int currentIndex = seasonIndex(current.season());
            current = currentIndex == SEASON_ORDER.size() - 1
                    ? new SemesterRef(SEASON_ORDER.get(0), current.year() + 1)
                    : new SemesterRef(SEASON_ORDER.get(currentIndex + 1), current.year());
        }
        return semesters;
    }

    private void validateNoSemesterOverlap(EventStructureConfigDto configuration, Integer ignoredEventId) {
        SemesterRange candidateRange = new SemesterRange(
                parseSemesterLabel(configuration.startSemester(), "Start semester is required"),
                parseSemesterLabel(configuration.endSemester(), "End semester is required")
        );

        for (HackathonEventEntity existingEvent : eventRepository.findAll()) {
            if (ignoredEventId != null && ignoredEventId.equals(existingEvent.getEventId())) {
                continue;
            }
            SemesterRange existingRange = resolveSemesterRange(existingEvent);
            if (existingRange != null && semesterRangesOverlap(candidateRange, existingRange)) {
                throw new ApiException(
                        HttpStatus.CONFLICT,
                        "The selected semester range overlaps with existing event "
                                + existingEvent.getName()
                                + " ("
                                + semesterLabel(existingRange.start())
                                + " -> "
                                + semesterLabel(existingRange.end())
                                + ")"
                );
            }
        }
    }

    private SemesterRange resolveSemesterRange(HackathonEventEntity event) {
        try {
            EventStructureConfigDto configuration = resolveConfiguration(event);
            List<SemesterRef> semesters = normalizeSemesterRange(
                    configuration.startSemester(),
                    configuration.endSemester(),
                    configuration.seasons()
            );
            return new SemesterRange(semesters.get(0), semesters.get(semesters.size() - 1));
        } catch (Exception ignored) {
            if (event.getSeason() == null || event.getYear() == null) {
                return null;
            }
            List<SemesterRef> legacySemesters = new ArrayList<>();
            for (String token : event.getSeason().split("\\+")) {
                String normalized = token == null ? "" : token.trim();
                if (normalized.isBlank()) {
                    continue;
                }
                try {
                    legacySemesters.add(new SemesterRef(normalizeSeasonName(normalized), requirePositiveYear(event.getYear())));
                } catch (ApiException ignoredApiException) {
                    // Ignore invalid legacy season tokens and fall back to the remaining ones.
                }
            }
            if (legacySemesters.isEmpty()) {
                return null;
            }
            legacySemesters.sort(this::compareSemesterRefs);
            return new SemesterRange(legacySemesters.get(0), legacySemesters.get(legacySemesters.size() - 1));
        }
    }

    private boolean semesterRangesOverlap(SemesterRange left, SemesterRange right) {
        return compareSemesterRefs(left.start(), right.end()) <= 0
                && compareSemesterRefs(right.start(), left.end()) <= 0;
    }

    private String normalizeKey(String rawKey, String fallbackText, String prefix, int index) {
        String source = rawKey == null || rawKey.isBlank() ? fallbackText : rawKey;
        String normalized = KEY_SANITIZER.matcher(source.trim().toLowerCase(Locale.ROOT))
                .replaceAll("-")
                .replaceAll("^-+", "")
                .replaceAll("-+$", "");
        if (normalized.isBlank()) {
            normalized = prefix + "-" + index;
        }
        return normalized;
    }

    private String requireTrimmedValue(String value, String message) {
        if (value == null || value.trim().isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, message);
        }
        return value.trim();
    }

    private void validateStatusTransition(HackathonEventEntity event, EventStatus nextStatus) {
        EventStatus currentStatus = EventStatus.from(event.getStatus());
        if (currentStatus == nextStatus) {
            return;
        }
        if (currentStatus.isTerminal()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Cannot change event status from " + currentStatus.getDbValue() + " to " + nextStatus.getDbValue());
        }
        if (nextStatus == EventStatus.CANCELLED) {
            if (Set.of(EventStatus.DRAFT, EventStatus.CONFIGURED, EventStatus.REGISTRATION_OPEN, EventStatus.ONGOING)
                    .contains(currentStatus)) {
                return;
            }
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Cannot change event status from " + currentStatus.getDbValue() + " to Cancelled");
        }

        if (nextStatus.ordinal() != currentStatus.ordinal() + 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Cannot change event status from " + currentStatus.getDbValue() + " to " + nextStatus.getDbValue());
        }
        if (nextStatus == EventStatus.ONGOING) {
            validateTeamsReadyForEvent(event.getEventId());
        }
    }

    private void validateConfiguredReadiness(Integer eventId) {
        if (eventId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Event must be saved before configuring");
        }
        HackathonEventEntity event = getEventOrThrow(eventId);
        EventStructureConfigDto configuration = resolveConfiguration(event);
        normalizeAndValidateConfiguration(configuration, event.getStartDate(), event.getEndDate());
    }

    private void validateTeamsReadyForEvent(Integer eventId) {
        long invalidTeams = teamRepository.countInvalidTeamSizesByEventId(eventId, MIN_TEAM_SIZE, MAX_TEAM_SIZE);
        if (invalidTeams > 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "All teams must have 3 to 5 members before the event can start");
        }
    }

    private void requireTrackHasNoTeams(Integer trackId) {
        if (teamRepository.countByTrackTrackId(trackId) > 0) {
            throw new ApiException(HttpStatus.CONFLICT, "Track cannot be deleted after teams have registered");
        }
    }

    private void applyRoundRequest(RoundEntity round, RoundUpsertRequest request) {
        round.setRoundName(requireTrimmedValue(request.roundName(), "Round name is required"));
        round.setRoundOrder(request.roundOrder());
        round.setSubmissionDeadline(request.submissionDeadline());
        round.setPromotionRuleTopN(request.promotionRuleTopN());
        if (round.getScoreLocked() == null) {
            round.setScoreLocked(false);
        }
    }

    private EventStructureConfigDto resolveConfiguration(HackathonEventEntity event) {
        if (event.getConfigurationJson() != null && !event.getConfigurationJson().isBlank()) {
            try {
                return objectMapper.readValue(event.getConfigurationJson(), EventStructureConfigDto.class);
            } catch (JsonProcessingException exception) {
                throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Stored event configuration is invalid");
            }
        }
        return deriveLegacyConfiguration(event);
    }

    private String writeConfiguration(EventStructureConfigDto configuration) {
        try {
            return objectMapper.writeValueAsString(configuration);
        } catch (JsonProcessingException exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Unable to store event configuration");
        }
    }

    private EventStructureConfigDto deriveLegacyConfiguration(HackathonEventEntity event) {
        List<TrackEntity> tracks = trackRepository.findByEventIdOrderByTrackIdAsc(event.getEventId());
        List<RoundEntity> rounds = roundRepository.findByEventIdOrderByRoundOrderAsc(event.getEventId());
        String seasonName = SEASON_ORDER.stream()
                .filter(candidate -> candidate.equalsIgnoreCase(event.getSeason()))
                .findFirst()
                .orElse("Summer");
        SemesterRef semester = new SemesterRef(seasonName, event.getYear());

        List<EventStructureConfigDto.TrackConfigDto> derivedTracks = tracks.stream()
                .map(track -> new EventStructureConfigDto.TrackConfigDto(
                        normalizeKey("track-" + track.getTrackId(), track.getName(), "track", track.getTrackId()),
                        track.getName(),
                        null
                ))
                .toList();

        List<EventStructureConfigDto.RoundStageConfigDto> derivedRounds = new ArrayList<>();
        List<EventStructureConfigDto.PromotionRuleDto> derivedPromotionRules = new ArrayList<>();
        for (int index = 0; index < rounds.size(); index += 1) {
            RoundEntity round = rounds.get(index);
            boolean finalRound = index == rounds.size() - 1;

            derivedRounds.add(new EventStructureConfigDto.RoundStageConfigDto(
                    normalizeKey("round-" + round.getRoundId(), round.getRoundName(), "round", round.getRoundId()),
                    round.getRoundName(),
                    round.getRoundOrder(),
                    round.getSubmissionDeadline().toLocalDate(),
                    round.getSubmissionDeadline().toLocalDate(),
                    finalRound
            ));

            if (!finalRound) {
                RoundEntity nextRound = rounds.get(index + 1);
                for (EventStructureConfigDto.TrackConfigDto track : derivedTracks) {
                    derivedPromotionRules.add(new EventStructureConfigDto.PromotionRuleDto(
                            track.trackKey(),
                            normalizeKey("round-" + round.getRoundId(), round.getRoundName(), "round", round.getRoundId()),
                            normalizeKey("round-" + nextRound.getRoundId(), nextRound.getRoundName(), "round", nextRound.getRoundId()),
                            Math.max(1, round.getPromotionRuleTopN())
                    ));
                }
            }
        }

        List<EventStructureConfigDto.SeasonConfigDto> seasons = List.of(
                new EventStructureConfigDto.SeasonConfigDto(
                        seasonName,
                        event.getYear(),
                        event.getStartDate(),
                        event.getStartDate(),
                        event.getStartDate(),
                        event.getEndDate(),
                        "TEAM_SELECT",
                        derivedTracks,
                        derivedRounds,
                        derivedPromotionRules,
                        "RANK_BY_SCORE",
                        List.of(),
                        List.of(new EventStructureConfigDto.AwardConfigDto("Champion", 1))
                )
        );

        return new EventStructureConfigDto(
                semesterLabel(semester),
                semesterLabel(semester),
                seasons,
                false,
                null,
                null,
                null,
                null,
                List.of(),
                List.of()
        );
    }

    private EventManagementDto toEventDto(HackathonEventEntity event) {
        return new EventManagementDto(
                event.getEventId(),
                event.getName(),
                event.getSeason(),
                event.getYear(),
                event.getStartDate(),
                event.getEndDate(),
                event.getStatus(),
                event.getDescription(),
                resolveConfiguration(event)
        );
    }

    private TrackDto toTrackDto(TrackEntity track) {
        return new TrackDto(track.getTrackId(), track.getEventId(), track.getName());
    }

    private RoundManagementDto toRoundDto(RoundEntity round) {
        return new RoundManagementDto(
                round.getRoundId(),
                round.getEventId(),
                round.getRoundName(),
                round.getRoundOrder(),
                round.getSubmissionDeadline(),
                round.getPromotionRuleTopN(),
                Boolean.TRUE.equals(round.getScoreLocked())
        );
    }

    private record SemesterRef(String season, Integer year) {
    }

    private record SemesterRange(SemesterRef start, SemesterRef end) {
    }
}
