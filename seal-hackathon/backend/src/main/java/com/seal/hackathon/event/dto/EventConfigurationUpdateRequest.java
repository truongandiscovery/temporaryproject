package com.seal.hackathon.event.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record EventConfigurationUpdateRequest(
        @NotNull
        @Valid
        EventUpsertRequest event,
        @NotNull
        @Valid
        EventStructureConfigDto configuration
) {
}
