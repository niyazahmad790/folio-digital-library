
package com.niyaz.digital_library.dto;

public class LoginResponse {

    private String message;
    private Integer userId;
    private String name;
    private String email;
    private String role;
    private String token;

    public LoginResponse() {
    }

    public LoginResponse(String message, Integer userId,
                         String name, String email, String role,
                         String token) {
        this.message = message;
        this.userId = userId;
        this.name = name;
        this.email = email;
        this.role = role;
        this.token = token;
    }

    public String getToken() {
        return token;
    }

    public String getMessage() {
        return message;
    }

    public Integer getUserId() {
        return userId;
    }

    public String getName() {
        return name;
    }

    public String getEmail() {
        return email;
    }

    public String getRole() {
        return role;
    }
}
