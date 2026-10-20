
package com.niyaz.digital_library.config;

import com.niyaz.digital_library.entity.User;
import com.niyaz.digital_library.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    name = "app.admin-bootstrap.enabled",
        havingValue = "true"
)
public class AdminPasswordResetRunner implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String adminEmail;
    private final String adminPassword;
    private final boolean resetExistingAdminPassword;

    public AdminPasswordResetRunner(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            @Value("${ADMIN_BOOTSTRAP_EMAIL:}") String adminEmail,
            @Value("${ADMIN_BOOTSTRAP_PASSWORD:}") String adminPassword,
            @Value("${app.admin-bootstrap.reset-existing-password:false}")
            boolean resetExistingAdminPassword) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
        this.resetExistingAdminPassword = resetExistingAdminPassword;
    }

    @Override
    public void run(String... args) {
        if (adminEmail.isBlank() || adminPassword.isBlank()
                || !adminEmail.contains("@")) {
            throw new IllegalStateException(
                    "A valid ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD are required when admin bootstrap is enabled");
        }
        String normalizedEmail = adminEmail.trim();
        User admin = userRepository.findByEmail(normalizedEmail).orElseGet(() -> {
            User newAdmin = new User();
            newAdmin.setName(normalizedEmail.substring(0, normalizedEmail.indexOf('@')));
            newAdmin.setEmail(normalizedEmail);
            newAdmin.setPassword(passwordEncoder.encode(adminPassword));
            return newAdmin;
        });

        if (!"ADMIN".equalsIgnoreCase(admin.getRole())
            || resetExistingAdminPassword) {
            admin.setPassword(passwordEncoder.encode(adminPassword));
        }
        admin.setRole("ADMIN");

        userRepository.save(admin);
        System.out.println(resetExistingAdminPassword
            ? "Admin account password reset completed."
            : "Admin account bootstrap completed.");
    }
}
