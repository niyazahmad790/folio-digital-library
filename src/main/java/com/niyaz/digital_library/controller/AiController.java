
package com.niyaz.digital_library.controller;

import com.niyaz.digital_library.service.LibraryChatService;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final ChatClient chatClient;
    private final LibraryChatService libraryChatService;

    public AiController(
            ChatClient.Builder chatClientBuilder,
            LibraryChatService libraryChatService) {
        this.chatClient = chatClientBuilder.build();
        this.libraryChatService = libraryChatService;
    }

    @PostMapping("/chat")
    public Map<String, String> chat(
            @RequestBody Map<String, String> request) {

        String message = request.get("message");

        if (message == null || message.isBlank()) {
            throw new IllegalArgumentException(
                    "Message cannot be empty");
        }

        String answer = chatClient.prompt()
                .user(message)
                .call()
                .content();

        return Map.of("answer", answer);
    }

    @PostMapping("/library-chat")
    public Map<String, String> libraryChat(
            @RequestBody Map<String, String> request) {

        // Frontend may send "question" or "message".
        String question = request.get("question");

        if (question == null || question.isBlank()) {
            question = request.get("message");
        }

        if (question == null || question.isBlank()) {
            throw new IllegalArgumentException(
                    "Question cannot be empty");
        }

        String answer =
                libraryChatService.askLibraryQuestion(question);

        return Map.of("answer", answer);
    }
}
