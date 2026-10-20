
package com.niyaz.digital_library.controller;

import com.niyaz.digital_library.entity.Fine;
import com.niyaz.digital_library.service.FineService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/fines")
public class FineController {

    private final FineService fineService;

    public FineController(FineService fineService) {
        this.fineService = fineService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('STUDENT', 'ADMIN')")
    public List<Fine> getFines(Authentication authentication) {
        return fineService.getFines(userId(authentication), isAdmin(authentication));
    }

    // Calculate and save the fine for an issue.
    // Returns 200 with the Fine body when the book was returned late,
    // or 204 No Content when the book was returned on time (no fine applies).
    @PostMapping("/{issueId}/calculate")
    @PreAuthorize("hasAnyRole('STUDENT', 'ADMIN')")
    public ResponseEntity<Fine> calculateFine(
            @PathVariable Integer issueId,
            Authentication authentication) {

        Fine fine = fineService.calculateFine(
                issueId, userId(authentication), isAdmin(authentication));

        return fine == null
                ? ResponseEntity.noContent().build()
                : ResponseEntity.ok(fine);
    }

    // Mark a fine as paid.
    @PutMapping("/{fineId}/pay")
    @PreAuthorize("hasAnyRole('STUDENT', 'ADMIN')")
    public Fine payFine(@PathVariable Integer fineId, Authentication authentication) {
        return fineService.payFine(fineId, userId(authentication), isAdmin(authentication));
    }

    private Integer userId(Authentication authentication) {
        return Integer.valueOf(authentication.getName());
    }

    private boolean isAdmin(Authentication authentication) {
        return authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));
    }
}
