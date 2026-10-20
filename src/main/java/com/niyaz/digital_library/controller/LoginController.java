
package com.niyaz.digital_library.controller;

import com.niyaz.digital_library.dto.LoginRequest;
import com.niyaz.digital_library.dto.LoginResponse;
import com.niyaz.digital_library.entity.User;
import com.niyaz.digital_library.service.JwtService;
import com.niyaz.digital_library.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class LoginController {

    private final UserService userService;
    private final JwtService jwtService;

    public LoginController(UserService userService,
                           JwtService jwtService) {
        this.userService = userService;
        this.jwtService = jwtService;
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @RequestBody LoginRequest request) {

        User user = userService.loginUser(
                request.getEmail(),
                request.getPassword()
        );

        String token = jwtService.generateToken(
                user.getId(),
                user.getEmail(),
                user.getRole()
        );

        LoginResponse response = new LoginResponse(
                "Login successful",
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole(),
                token
        );

        return ResponseEntity.ok(response);
    }
}
