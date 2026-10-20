
package com.niyaz.digital_library.controller;

import com.niyaz.digital_library.entity.User;
import com.niyaz.digital_library.service.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createUser(
            @jakarta.validation.Valid @RequestBody User user) {

        // Public registration always creates a STUDENT
        user.setRole("STUDENT");

        User savedUser = userService.saveUser(user);

        // Never return the password in the API response
        Map<String, Object> response = Map.of(
                "id", savedUser.getId(),
                "name", savedUser.getName(),
                "email", savedUser.getEmail(),
                "role", savedUser.getRole()
        );

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(response);
    }
}
