package com.seal.hackathon.event.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record EventStructureConfigDto(
        String startSemester,
        String endSemester,
        List<SeasonConfigDto> seasons,
        Boolean overallGrandFinalEnabled,
        LocalDate overallGrandFinalStartDate,
        LocalDate overallGrandFinalEndDate,
        String overallGrandFinalEligibility,
        String overallGrandFinalMethod,
        List<String> overallAdditionalActivities,
        List<AwardConfigDto> overallAwards
) {
    public record SeasonConfigDto(
            String season,
            Integer year,
            LocalDate registrationStartDate,
            LocalDate registrationEndDate,
            LocalDate competitionStartDate,
            LocalDate competitionEndDate,
            String trackSelectionMode,
            List<TrackConfigDto> tracks,
            List<RoundStageConfigDto> rounds,
            List<PromotionRuleDto> promotionRules,
            String finalRankingMode,
            List<String> additionalFinalActivities,
            List<AwardConfigDto> awards
    ) {
    }

    public record TrackConfigDto(
            String trackKey,
            String name,
            String description
    ) {
    }

    public record RoundStageConfigDto(
            String roundKey,
            String roundName,
            Integer roundOrder,
            LocalDate startDate,
            LocalDate endDate,
            Boolean finalRound
    ) {
    }

    public record PromotionRuleDto(
            String trackKey,
            String fromRoundKey,
            String toRoundKey,
            Integer topN
    ) {
    }

    public record AwardConfigDto(
            String awardName,
            Integer quantity
    ) {
    }
}
