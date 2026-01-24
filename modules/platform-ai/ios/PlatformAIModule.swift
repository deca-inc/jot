import ExpoModulesCore
import Speech
import AVFoundation

// Import Foundation Models framework conditionally for iOS 26+
#if canImport(FoundationModels)
import FoundationModels
#endif

public class PlatformAIModule: Module {
  // Store sessions for multi-turn conversations
  private var sessions: [String: Any] = [:]

  // Speech recognition components
  private var speechRecognizer: SFSpeechRecognizer?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var audioEngine: AVAudioEngine?

  // Track current transcription
  private var currentTranscription: String = ""
  private var isRecognitionActive: Bool = false

  public func definition() -> ModuleDefinition {
    Name("PlatformAI")

    // Check if Apple Foundation Models are available (iOS 26+)
    AsyncFunction("isAppleFoundationModelsAvailable") { () -> Bool in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        // Check availability via the model's availability property
        let model = SystemLanguageModel.default
        switch model.availability {
        case .available:
          return true
        case .unavailable:
          return false
        @unknown default:
          return false
        }
      }
      #endif
      return false
    }

    // Not available on iOS
    AsyncFunction("isGeminiNanoAvailable") { () -> Bool in
      return false
    }

    // Generate using Apple Foundation Models
    AsyncFunction("generateWithAppleFoundation") { (systemPrompt: String, messages: [[String: String]]) -> String in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        // Check availability
        let model = SystemLanguageModel.default
        guard case .available = model.availability else {
          throw PlatformAIError.notAvailable("Apple Intelligence is not available on this device. Please enable it in Settings > Apple Intelligence & Siri.")
        }

        // Create a new session with the system prompt as instructions
        // The session maintains conversation history automatically
        let session: LanguageModelSession
        if systemPrompt.isEmpty {
          session = LanguageModelSession()
        } else {
          session = LanguageModelSession {
            systemPrompt
          }
        }

        // Process all messages except the last one to build up context
        // The last user message will be the actual prompt
        for (index, msg) in messages.enumerated() {
          guard let role = msg["role"], let content = msg["content"] else {
            continue
          }

          // Skip the last message - we'll use it as the final prompt
          if index == messages.count - 1 {
            break
          }

          // Add previous turns to the session to build context
          // The session automatically maintains the transcript
          if role == "user" {
            // For context, we need to add prior user messages and their responses
            // But since we don't have the original responses, we'll use the next assistant message
            continue
          }
        }

        // Get the last user message as the prompt
        guard let lastMessage = messages.last,
              lastMessage["role"] == "user",
              let userPrompt = lastMessage["content"] else {
          throw PlatformAIError.invalidInput("Messages must end with a user message")
        }

        // Generate response
        do {
          let response = try await session.respond(to: userPrompt)
          return response.content
        } catch let error as NSError {
          // Provide helpful error messages for common issues
          if error.domain == "FoundationModels.LanguageModelSession.GenerationError" {
            if error.code == -1 {
              // Error -1 typically means the model assets aren't available
              // This happens in simulator when Mac doesn't have Apple Intelligence enabled
              #if targetEnvironment(simulator)
              throw PlatformAIError.generationFailed(
                "Apple Intelligence is not available in the simulator. " +
                "Foundation Models run on your Mac, which requires: " +
                "1) Apple Silicon Mac (M1+), " +
                "2) macOS 26+, " +
                "3) Apple Intelligence enabled in System Settings → Apple Intelligence & Siri. " +
                "Try on a physical device instead."
              )
              #else
              throw PlatformAIError.generationFailed(
                "Apple Intelligence failed to generate. Please ensure Apple Intelligence is enabled " +
                "in Settings → Apple Intelligence & Siri, and the model has finished downloading."
              )
              #endif
            }
          }
          throw PlatformAIError.generationFailed("Generation failed: \(error.localizedDescription)")
        }
      } else {
        throw PlatformAIError.notAvailable("iOS 26+ required for Apple Intelligence")
      }
      #else
      throw PlatformAIError.notAvailable("Apple Intelligence not available (requires iOS 26+)")
      #endif
    }

    // Not available on iOS
    AsyncFunction("generateWithGeminiNano") { (_: String, _: [[String: String]]) -> String in
      throw PlatformAIError.notAvailable("Gemini Nano is only available on Android")
    }

    // MARK: - Speech-to-Text Functions

    // Check if Apple Speech Recognition is available
    AsyncFunction("isAppleSpeechAvailable") { () -> Bool in
      // SFSpeechRecognizer is available on iOS 10+
      guard let recognizer = SFSpeechRecognizer() else {
        return false
      }
      return recognizer.isAvailable
    }

    // Not available on iOS
    AsyncFunction("isAndroidSpeechAvailable") { () -> Bool in
      return false
    }

    // Request speech recognition permission
    AsyncFunction("requestSpeechPermission") { () async -> Bool in
      return await withCheckedContinuation { continuation in
        SFSpeechRecognizer.requestAuthorization { status in
          continuation.resume(returning: status == .authorized)
        }
      }
    }

    // Start speech recognition (returns session ID)
    AsyncFunction("startSpeechRecognition") { (locale: String?) async throws -> String in
      // Check/request permission
      let status = SFSpeechRecognizer.authorizationStatus()
      if status != .authorized {
        let authorized = await withCheckedContinuation { continuation in
          SFSpeechRecognizer.requestAuthorization { status in
            continuation.resume(returning: status == .authorized)
          }
        }
        if !authorized {
          throw PlatformAIError.notAvailable("Speech recognition permission not granted. Please enable it in Settings > Privacy > Speech Recognition.")
        }
      }

      // Initialize speech recognizer
      let recognizerLocale = locale != nil ? Locale(identifier: locale!) : Locale.current
      guard let recognizer = SFSpeechRecognizer(locale: recognizerLocale) else {
        throw PlatformAIError.notAvailable("Speech recognizer not available for locale: \(recognizerLocale.identifier)")
      }

      guard recognizer.isAvailable else {
        throw PlatformAIError.notAvailable("Speech recognizer is not currently available")
      }

      self.speechRecognizer = recognizer

      // Set up audio session
      let audioSession = AVAudioSession.sharedInstance()
      try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
      try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

      // Create recognition request
      let request = SFSpeechAudioBufferRecognitionRequest()
      request.shouldReportPartialResults = true
      request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition

      self.recognitionRequest = request

      // Set up audio engine
      let engine = AVAudioEngine()
      self.audioEngine = engine

      let inputNode = engine.inputNode
      let recordingFormat = inputNode.outputFormat(forBus: 0)

      inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
        self?.recognitionRequest?.append(buffer)
      }

      engine.prepare()
      try engine.start()

      // Reset transcription
      self.currentTranscription = ""
      self.isRecognitionActive = true

      // Start recognition task
      self.recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
        guard let self = self else { return }

        if let result = result {
          self.currentTranscription = result.bestTranscription.formattedString
        }

        if error != nil || (result?.isFinal ?? false) {
          self.isRecognitionActive = false
        }
      }

      // Return a session ID
      let sessionId = UUID().uuidString
      return sessionId
    }

    // Get current transcription (call periodically to get partial results)
    AsyncFunction("getCurrentTranscription") { () -> [String: Any] in
      return [
        "text": self.currentTranscription,
        "isFinal": !self.isRecognitionActive
      ]
    }

    // Stop speech recognition and get final result
    AsyncFunction("stopSpeechRecognition") { () async throws -> String in
      // Stop audio engine
      self.audioEngine?.stop()
      self.audioEngine?.inputNode.removeTap(onBus: 0)

      // End the recognition request
      self.recognitionRequest?.endAudio()

      // Wait a brief moment for final result
      try await Task.sleep(nanoseconds: 200_000_000) // 200ms

      // Cancel the task if still running
      self.recognitionTask?.cancel()

      // Deactivate audio session
      try? AVAudioSession.sharedInstance().setActive(false)

      // Get final transcription
      let finalText = self.currentTranscription

      // Clean up
      self.recognitionRequest = nil
      self.recognitionTask = nil
      self.audioEngine = nil
      self.isRecognitionActive = false

      return finalText
    }

    // Cancel speech recognition without getting result
    AsyncFunction("cancelSpeechRecognition") { () in
      // Stop audio engine
      self.audioEngine?.stop()
      self.audioEngine?.inputNode.removeTap(onBus: 0)

      // Cancel recognition
      self.recognitionTask?.cancel()
      self.recognitionRequest?.endAudio()

      // Deactivate audio session
      try? AVAudioSession.sharedInstance().setActive(false)

      // Clean up
      self.recognitionRequest = nil
      self.recognitionTask = nil
      self.audioEngine = nil
      self.currentTranscription = ""
      self.isRecognitionActive = false
    }

    // Not available on iOS
    AsyncFunction("startAndroidSpeechRecognition") { (_: String?) -> String in
      throw PlatformAIError.notAvailable("Android speech recognition is only available on Android")
    }

    AsyncFunction("stopAndroidSpeechRecognition") { () -> String in
      throw PlatformAIError.notAvailable("Android speech recognition is only available on Android")
    }

    AsyncFunction("cancelAndroidSpeechRecognition") { () in
      throw PlatformAIError.notAvailable("Android speech recognition is only available on Android")
    }

    AsyncFunction("getAndroidTranscription") { () -> [String: Any] in
      throw PlatformAIError.notAvailable("Android speech recognition is only available on Android")
    }
  }
}

// Custom errors for the module
enum PlatformAIError: Error, LocalizedError {
  case notAvailable(String)
  case invalidInput(String)
  case generationFailed(String)

  var errorDescription: String? {
    switch self {
    case .notAvailable(let message):
      return message
    case .invalidInput(let message):
      return message
    case .generationFailed(let message):
      return message
    }
  }
}
