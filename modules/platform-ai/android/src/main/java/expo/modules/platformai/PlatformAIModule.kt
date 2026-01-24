package expo.modules.platformai

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collect
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.GenAiException
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Platform AI Module for Android
 *
 * Provides access to:
 * - Platform speech recognition via Android SpeechRecognizer
 * - Gemini Nano via ML Kit GenAI Prompt API (alpha, limited device support)
 *
 * See: https://developers.google.com/ml-kit/genai/prompt/android
 */
class PlatformAIModule : Module() {
    private val TAG = "PlatformAI"
    private val scope = CoroutineScope(Dispatchers.IO)
    private val mainHandler = Handler(Looper.getMainLooper())

    // Speech recognition components
    private var speechRecognizer: SpeechRecognizer? = null
    private var currentTranscription: String = ""
    private var isRecognitionActive: Boolean = false

    // Gemini Nano generative model
    private var generativeModel: GenerativeModel? = null

    // PCM Audio recording components for Whisper
    private var audioRecord: AudioRecord? = null
    private var isRecordingPCM: Boolean = false
    private var pcmRecordingThread: Thread? = null
    private var currentPCMOutputPath: String? = null
    private var pcmTotalBytesWritten: Long = 0
    @Volatile private var currentMeteringLevel: Float = 0f  // 0-1 normalized audio level

    // Audio recording constants (16kHz mono 16-bit for Whisper)
    private val SAMPLE_RATE = 16000
    private val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
    private val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT

    private fun getContext(): Context? {
        return appContext.reactContext
    }

    private fun getGenerativeModel(): GenerativeModel {
        if (generativeModel == null) {
            generativeModel = Generation.getClient()
        }
        return generativeModel!!
    }

    override fun definition() = ModuleDefinition {
        Name("PlatformAI")

        // iOS-only function, not available on Android
        AsyncFunction("isAppleFoundationModelsAvailable") { promise: Promise ->
            promise.resolve(false)
        }

        // Check if Gemini Nano is available via ML Kit GenAI
        AsyncFunction("isGeminiNanoAvailable") { promise: Promise ->
            scope.launch {
                try {
                    val model = getGenerativeModel()
                    val status = model.checkStatus()
                    Log.d(TAG, "Gemini Nano status: $status")

                    when (status) {
                        FeatureStatus.AVAILABLE -> {
                            promise.resolve(true)
                        }
                        FeatureStatus.DOWNLOADABLE -> {
                            // Model can be downloaded but isn't yet
                            promise.resolve(false)
                        }
                        FeatureStatus.DOWNLOADING -> {
                            // Download in progress
                            promise.resolve(false)
                        }
                        FeatureStatus.UNAVAILABLE -> {
                            // Not supported on this device
                            promise.resolve(false)
                        }
                        else -> {
                            promise.resolve(false)
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error checking Gemini Nano availability", e)
                    promise.resolve(false)
                }
            }
        }

        // Check Gemini Nano download status (for UI to show download button)
        AsyncFunction("getGeminiNanoStatus") { promise: Promise ->
            scope.launch {
                try {
                    val model = getGenerativeModel()
                    val status = model.checkStatus()
                    val statusString = when (status) {
                        FeatureStatus.AVAILABLE -> "available"
                        FeatureStatus.DOWNLOADABLE -> "downloadable"
                        FeatureStatus.DOWNLOADING -> "downloading"
                        FeatureStatus.UNAVAILABLE -> "unavailable"
                        else -> "unknown"
                    }
                    promise.resolve(statusString)
                } catch (e: Exception) {
                    Log.e(TAG, "Error getting Gemini Nano status", e)
                    promise.resolve("unavailable")
                }
            }
        }

        // Download Gemini Nano model
        AsyncFunction("downloadGeminiNano") { promise: Promise ->
            scope.launch {
                try {
                    val model = getGenerativeModel()
                    val status = model.checkStatus()

                    if (status == FeatureStatus.AVAILABLE) {
                        promise.resolve(true)
                        return@launch
                    }

                    if (status != FeatureStatus.DOWNLOADABLE) {
                        promise.reject("NOT_DOWNLOADABLE", "Gemini Nano is not available for download on this device", null)
                        return@launch
                    }

                    model.download().collect { downloadStatus ->
                        when (downloadStatus) {
                            is DownloadStatus.DownloadStarted -> {
                                Log.d(TAG, "Gemini Nano download started")
                            }
                            is DownloadStatus.DownloadProgress -> {
                                Log.d(TAG, "Gemini Nano download progress: ${downloadStatus.totalBytesDownloaded} bytes")
                            }
                            DownloadStatus.DownloadCompleted -> {
                                Log.d(TAG, "Gemini Nano download completed")
                                promise.resolve(true)
                            }
                            is DownloadStatus.DownloadFailed -> {
                                Log.e(TAG, "Gemini Nano download failed: ${downloadStatus.e.message}")
                                promise.reject("DOWNLOAD_FAILED", "Download failed: ${downloadStatus.e.message}", downloadStatus.e)
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error downloading Gemini Nano", e)
                    promise.reject("DOWNLOAD_ERROR", "Failed to download: ${e.message}", e)
                }
            }
        }

        // iOS-only function
        AsyncFunction("generateWithAppleFoundation") { _: String, _: List<Map<String, String>>, promise: Promise ->
            promise.reject("NOT_AVAILABLE", "Apple Intelligence is only available on iOS", null)
        }

        // Generate using Gemini Nano via ML Kit GenAI Prompt API
        AsyncFunction("generateWithGeminiNano") { prompt: String, _: List<Map<String, String>>, promise: Promise ->
            scope.launch {
                try {
                    val model = getGenerativeModel()
                    val status = model.checkStatus()

                    if (status != FeatureStatus.AVAILABLE) {
                        promise.reject(
                            "NOT_AVAILABLE",
                            "Gemini Nano is not available. Status: $status",
                            null
                        )
                        return@launch
                    }

                    // Generate content
                    val response = model.generateContent(prompt)
                    val text = response.candidates.firstOrNull()?.text ?: ""

                    Log.d(TAG, "Gemini Nano generated response: ${text.take(100)}...")
                    promise.resolve(text)
                } catch (e: Exception) {
                    Log.e(TAG, "Error generating with Gemini Nano", e)
                    promise.reject("GENERATION_ERROR", "Failed to generate: ${e.message}", e)
                }
            }
        }

        // Stream generate using Gemini Nano (returns chunks via events)
        AsyncFunction("generateWithGeminiNanoStream") { prompt: String, promise: Promise ->
            scope.launch {
                try {
                    val model = getGenerativeModel()
                    val status = model.checkStatus()

                    if (status != FeatureStatus.AVAILABLE) {
                        promise.reject(
                            "NOT_AVAILABLE",
                            "Gemini Nano is not available. Status: $status",
                            null
                        )
                        return@launch
                    }

                    var fullResponse = ""
                    model.generateContentStream(prompt).collect { chunk ->
                        val newText = chunk.candidates.firstOrNull()?.text ?: ""
                        fullResponse += newText
                        // TODO: Emit event for streaming updates
                    }

                    promise.resolve(fullResponse)
                } catch (e: Exception) {
                    Log.e(TAG, "Error streaming with Gemini Nano", e)
                    promise.reject("GENERATION_ERROR", "Failed to generate: ${e.message}", e)
                }
            }
        }

        // Warmup Gemini Nano for better first-response latency
        AsyncFunction("warmupGeminiNano") { promise: Promise ->
            scope.launch {
                try {
                    val model = getGenerativeModel()
                    model.warmup()
                    Log.d(TAG, "Gemini Nano warmed up")
                    promise.resolve(true)
                } catch (e: Exception) {
                    Log.e(TAG, "Error warming up Gemini Nano", e)
                    promise.resolve(false)
                }
            }
        }

        // MARK: - Speech-to-Text Functions

        // iOS-only function
        AsyncFunction("isAppleSpeechAvailable") { promise: Promise ->
            promise.resolve(false)
        }

        // Check if Android speech recognition is available
        AsyncFunction("isAndroidSpeechAvailable") { promise: Promise ->
            val context = getContext()
            if (context == null) {
                promise.resolve(false)
                return@AsyncFunction
            }
            val isAvailable = SpeechRecognizer.isRecognitionAvailable(context)
            Log.d(TAG, "Android speech recognition available: $isAvailable")
            promise.resolve(isAvailable)
        }

        // Request speech permission (Android handles this differently - need RECORD_AUDIO permission)
        AsyncFunction("requestSpeechPermission") { promise: Promise ->
            // On Android, permission is handled through the permission system
            // This just checks if recognition is available
            val context = getContext()
            if (context == null) {
                promise.resolve(false)
                return@AsyncFunction
            }
            promise.resolve(SpeechRecognizer.isRecognitionAvailable(context))
        }

        // iOS-only functions
        AsyncFunction("startSpeechRecognition") { _: String?, promise: Promise ->
            promise.reject("NOT_AVAILABLE", "Apple speech recognition is only available on iOS", null)
        }

        AsyncFunction("getCurrentTranscription") { promise: Promise ->
            promise.reject("NOT_AVAILABLE", "Apple speech recognition is only available on iOS", null)
        }

        AsyncFunction("stopSpeechRecognition") { promise: Promise ->
            promise.reject("NOT_AVAILABLE", "Apple speech recognition is only available on iOS", null)
        }

        AsyncFunction("cancelSpeechRecognition") { promise: Promise ->
            promise.reject("NOT_AVAILABLE", "Apple speech recognition is only available on iOS", null)
        }

        // Start Android speech recognition
        AsyncFunction("startAndroidSpeechRecognition") { locale: String?, promise: Promise ->
            val context = getContext()
            if (context == null) {
                promise.reject("NOT_AVAILABLE", "Context not available", null)
                return@AsyncFunction
            }

            if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                promise.reject("NOT_AVAILABLE", "Speech recognition not available on this device", null)
                return@AsyncFunction
            }

            mainHandler.post {
                try {
                    // Clean up existing recognizer
                    speechRecognizer?.destroy()

                    // Create new recognizer
                    val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
                    speechRecognizer = recognizer

                    // Reset state
                    currentTranscription = ""
                    isRecognitionActive = true

                    // Set up recognition listener
                    recognizer.setRecognitionListener(object : RecognitionListener {
                        override fun onReadyForSpeech(params: Bundle?) {
                            Log.d(TAG, "Ready for speech")
                        }

                        override fun onBeginningOfSpeech() {
                            Log.d(TAG, "Speech started")
                        }

                        override fun onRmsChanged(rmsdB: Float) {
                            // Audio level changed - could be used for visualization
                        }

                        override fun onBufferReceived(buffer: ByteArray?) {
                            // Audio buffer received
                        }

                        override fun onEndOfSpeech() {
                            Log.d(TAG, "Speech ended")
                        }

                        override fun onError(error: Int) {
                            val errorMessage = when (error) {
                                SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                                SpeechRecognizer.ERROR_CLIENT -> "Client error"
                                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
                                SpeechRecognizer.ERROR_NETWORK -> "Network error"
                                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
                                SpeechRecognizer.ERROR_NO_MATCH -> "No speech detected"
                                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer busy"
                                SpeechRecognizer.ERROR_SERVER -> "Server error"
                                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Speech timeout"
                                else -> "Unknown error: $error"
                            }
                            Log.e(TAG, "Recognition error: $errorMessage")
                            isRecognitionActive = false
                        }

                        override fun onResults(results: Bundle?) {
                            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            if (!matches.isNullOrEmpty()) {
                                currentTranscription = matches[0]
                                Log.d(TAG, "Final result: $currentTranscription")
                            }
                            isRecognitionActive = false
                        }

                        override fun onPartialResults(partialResults: Bundle?) {
                            val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            if (!matches.isNullOrEmpty()) {
                                currentTranscription = matches[0]
                                Log.d(TAG, "Partial result: $currentTranscription")
                            }
                        }

                        override fun onEvent(eventType: Int, params: Bundle?) {
                            // Recognition event
                        }
                    })

                    // Create recognition intent
                    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                        if (locale != null) {
                            putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
                        }
                        // Request continuous recognition
                        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 30000L)
                        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 10000L)
                    }

                    // Start listening
                    recognizer.startListening(intent)

                    // Return session ID
                    val sessionId = java.util.UUID.randomUUID().toString()
                    promise.resolve(sessionId)

                } catch (e: Exception) {
                    Log.e(TAG, "Error starting speech recognition", e)
                    promise.reject("RECOGNITION_ERROR", "Failed to start recognition: ${e.message}", e)
                }
            }
        }

        // Get current Android transcription
        AsyncFunction("getAndroidTranscription") { promise: Promise ->
            val result = mapOf(
                "text" to currentTranscription,
                "isFinal" to !isRecognitionActive
            )
            promise.resolve(result)
        }

        // Stop Android speech recognition
        AsyncFunction("stopAndroidSpeechRecognition") { promise: Promise ->
            mainHandler.post {
                try {
                    speechRecognizer?.stopListening()

                    // Give it a moment to finalize
                    mainHandler.postDelayed({
                        val finalText = currentTranscription
                        speechRecognizer?.destroy()
                        speechRecognizer = null
                        isRecognitionActive = false
                        promise.resolve(finalText)
                    }, 200)

                } catch (e: Exception) {
                    Log.e(TAG, "Error stopping speech recognition", e)
                    promise.reject("RECOGNITION_ERROR", "Failed to stop recognition: ${e.message}", e)
                }
            }
        }

        // Cancel Android speech recognition
        AsyncFunction("cancelAndroidSpeechRecognition") { promise: Promise ->
            mainHandler.post {
                try {
                    speechRecognizer?.cancel()
                    speechRecognizer?.destroy()
                    speechRecognizer = null
                    currentTranscription = ""
                    isRecognitionActive = false
                    promise.resolve(null)
                } catch (e: Exception) {
                    Log.e(TAG, "Error cancelling speech recognition", e)
                    promise.resolve(null)  // Don't reject on cancel
                }
            }
        }

        // MARK: - PCM Audio Recording Functions (for Whisper)

        // Start PCM audio recording to a WAV file
        // This uses AudioRecord instead of MediaRecorder to get raw PCM data
        AsyncFunction("startPCMRecording") { outputPath: String, promise: Promise ->
            if (isRecordingPCM) {
                promise.reject("ALREADY_RECORDING", "PCM recording already in progress", null)
                return@AsyncFunction
            }

            try {
                val bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
                if (bufferSize == AudioRecord.ERROR || bufferSize == AudioRecord.ERROR_BAD_VALUE) {
                    promise.reject("AUDIO_ERROR", "Unable to determine buffer size", null)
                    return@AsyncFunction
                }

                // Use a larger buffer for smoother recording
                val actualBufferSize = bufferSize * 4

                audioRecord = AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE,
                    CHANNEL_CONFIG,
                    AUDIO_FORMAT,
                    actualBufferSize
                )

                if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                    audioRecord?.release()
                    audioRecord = null
                    promise.reject("AUDIO_ERROR", "Failed to initialize AudioRecord", null)
                    return@AsyncFunction
                }

                currentPCMOutputPath = outputPath
                pcmTotalBytesWritten = 0

                // Create output file with WAV header placeholder
                val file = File(outputPath)
                file.parentFile?.mkdirs()
                val outputStream = FileOutputStream(file)

                // Write WAV header placeholder (44 bytes)
                // We'll update the sizes at the end
                writeWavHeader(outputStream, 0)

                isRecordingPCM = true
                audioRecord?.startRecording()

                // Start recording thread
                pcmRecordingThread = Thread {
                    val buffer = ShortArray(bufferSize / 2)
                    val byteBuffer = ByteArray(bufferSize)

                    try {
                        while (isRecordingPCM) {
                            val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                            if (read > 0) {
                                // Calculate RMS level for metering
                                var sum = 0.0
                                for (i in 0 until read) {
                                    val sample = buffer[i].toDouble()
                                    sum += sample * sample
                                }
                                val rms = Math.sqrt(sum / read)
                                // Normalize to 0-1 range (max short value is 32767)
                                // Use a lower reference for better visual response
                                val normalized = (rms / 16384.0).coerceIn(0.0, 1.0)
                                currentMeteringLevel = normalized.toFloat()

                                // Convert shorts to bytes (little-endian)
                                val bb = ByteBuffer.wrap(byteBuffer).order(ByteOrder.LITTLE_ENDIAN)
                                for (i in 0 until read) {
                                    bb.putShort(buffer[i])
                                }
                                outputStream.write(byteBuffer, 0, read * 2)
                                pcmTotalBytesWritten += (read * 2)
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error in PCM recording thread", e)
                    } finally {
                        currentMeteringLevel = 0f
                        try {
                            outputStream.close()
                        } catch (e: Exception) {
                            Log.e(TAG, "Error closing output stream", e)
                        }
                    }
                }
                pcmRecordingThread?.start()

                Log.d(TAG, "PCM recording started: $outputPath")
                promise.resolve(outputPath)

            } catch (e: SecurityException) {
                Log.e(TAG, "Permission error starting PCM recording", e)
                promise.reject("PERMISSION_ERROR", "Microphone permission not granted", e)
            } catch (e: Exception) {
                Log.e(TAG, "Error starting PCM recording", e)
                promise.reject("RECORDING_ERROR", "Failed to start recording: ${e.message}", e)
            }
        }

        // Stop PCM recording and finalize the WAV file
        AsyncFunction("stopPCMRecording") { promise: Promise ->
            if (!isRecordingPCM) {
                promise.reject("NOT_RECORDING", "No PCM recording in progress", null)
                return@AsyncFunction
            }

            try {
                isRecordingPCM = false

                // Wait for recording thread to finish
                pcmRecordingThread?.join(1000)
                pcmRecordingThread = null

                // Stop and release AudioRecord
                audioRecord?.stop()
                audioRecord?.release()
                audioRecord = null

                // Update WAV header with actual sizes
                val outputPath = currentPCMOutputPath
                if (outputPath != null) {
                    updateWavHeader(outputPath, pcmTotalBytesWritten)
                    Log.d(TAG, "PCM recording stopped. Total bytes: $pcmTotalBytesWritten, File: $outputPath")

                    // Calculate duration
                    val durationSeconds = pcmTotalBytesWritten.toDouble() / (SAMPLE_RATE * 2) // 16-bit = 2 bytes per sample

                    val result = mapOf(
                        "path" to outputPath,
                        "duration" to durationSeconds,
                        "size" to pcmTotalBytesWritten
                    )
                    promise.resolve(result)
                } else {
                    promise.reject("NO_OUTPUT", "No output path set", null)
                }

                currentPCMOutputPath = null

            } catch (e: Exception) {
                Log.e(TAG, "Error stopping PCM recording", e)
                promise.reject("STOP_ERROR", "Failed to stop recording: ${e.message}", e)
            }
        }

        // Cancel PCM recording and delete the file
        AsyncFunction("cancelPCMRecording") { promise: Promise ->
            try {
                isRecordingPCM = false

                // Wait for recording thread to finish
                pcmRecordingThread?.join(500)
                pcmRecordingThread = null

                // Stop and release AudioRecord
                audioRecord?.stop()
                audioRecord?.release()
                audioRecord = null

                // Delete the partial file
                val outputPath = currentPCMOutputPath
                if (outputPath != null) {
                    val file = File(outputPath)
                    if (file.exists()) {
                        file.delete()
                        Log.d(TAG, "Deleted partial PCM recording: $outputPath")
                    }
                }

                currentPCMOutputPath = null
                promise.resolve(null)

            } catch (e: Exception) {
                Log.e(TAG, "Error cancelling PCM recording", e)
                promise.resolve(null) // Don't reject on cancel
            }
        }

        // Check if PCM recording is active
        AsyncFunction("isPCMRecording") { promise: Promise ->
            promise.resolve(isRecordingPCM)
        }

        // Get current audio metering level (0-1 normalized)
        AsyncFunction("getPCMMeteringLevel") { promise: Promise ->
            promise.resolve(currentMeteringLevel.toDouble())
        }
    }

    /**
     * Write a WAV file header with placeholder sizes
     * Will be updated when recording stops
     */
    private fun writeWavHeader(outputStream: FileOutputStream, dataSize: Long) {
        val totalSize = 36 + dataSize
        val byteRate = SAMPLE_RATE * 1 * 16 / 8 // SampleRate * NumChannels * BitsPerSample/8

        outputStream.write("RIFF".toByteArray()) // ChunkID
        outputStream.write(intToByteArray(totalSize.toInt())) // ChunkSize
        outputStream.write("WAVE".toByteArray()) // Format

        outputStream.write("fmt ".toByteArray()) // Subchunk1ID
        outputStream.write(intToByteArray(16)) // Subchunk1Size (16 for PCM)
        outputStream.write(shortToByteArray(1)) // AudioFormat (1 = PCM)
        outputStream.write(shortToByteArray(1)) // NumChannels (1 = mono)
        outputStream.write(intToByteArray(SAMPLE_RATE)) // SampleRate
        outputStream.write(intToByteArray(byteRate)) // ByteRate
        outputStream.write(shortToByteArray(2)) // BlockAlign (NumChannels * BitsPerSample/8)
        outputStream.write(shortToByteArray(16)) // BitsPerSample

        outputStream.write("data".toByteArray()) // Subchunk2ID
        outputStream.write(intToByteArray(dataSize.toInt())) // Subchunk2Size
    }

    /**
     * Update the WAV header with actual data size
     */
    private fun updateWavHeader(filePath: String, dataSize: Long) {
        val file = RandomAccessFile(filePath, "rw")
        val totalSize = 36 + dataSize

        // Update ChunkSize at offset 4
        file.seek(4)
        file.write(intToByteArray(totalSize.toInt()))

        // Update Subchunk2Size at offset 40
        file.seek(40)
        file.write(intToByteArray(dataSize.toInt()))

        file.close()
    }

    private fun intToByteArray(value: Int): ByteArray {
        return ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(value).array()
    }

    private fun shortToByteArray(value: Int): ByteArray {
        return ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN).putShort(value.toShort()).array()
    }
}
