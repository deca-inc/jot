package com.dotdotdot.jot.widget

import org.junit.Assert.*
import org.junit.Test

/**
 * Tests for CountdownFormatter
 * Mirrors the TypeScript tests in lib/utils/countdown.test.ts
 */
class CountdownFormatterTest {

    // MARK: - calculateTimeRemaining Tests

    @Test
    fun `calculateTimeRemaining returns correct values for future date`() {
        // 5 days from now
        val futureDate = System.currentTimeMillis() + 5 * 24 * 60 * 60 * 1000
        val result = CountdownFormatter.calculateTimeRemaining(futureDate)

        assertFalse(result.isPast)
        assertEquals(5, result.days)
    }

    @Test
    fun `calculateTimeRemaining returns correct values for past date`() {
        // 2 days ago
        val pastDate = System.currentTimeMillis() - 2 * 24 * 60 * 60 * 1000
        val result = CountdownFormatter.calculateTimeRemaining(pastDate)

        assertTrue(result.isPast)
        assertEquals(2, result.days)
    }

    @Test
    fun `calculateTimeRemaining returns zero for current time`() {
        val result = CountdownFormatter.calculateTimeRemaining(System.currentTimeMillis())

        assertEquals(0, result.days)
        assertEquals(0, result.hours)
        assertEquals(0, result.minutes)
    }

    @Test
    fun `calculateTimeRemaining calculates totalMinutes correctly`() {
        // 1 day, 2 hours, 30 minutes = 1590 minutes
        val futureDate = System.currentTimeMillis() +
            1 * 24 * 60 * 60 * 1000 +
            2 * 60 * 60 * 1000 +
            30 * 60 * 1000
        val result = CountdownFormatter.calculateTimeRemaining(futureDate)

        assertEquals(1590, result.totalMinutes)
    }

    // MARK: - format Tests (Countdown Mode)

    @Test
    fun `format shows days and hours when more than 1 day`() {
        // 5 days, 3 hours from now
        val futureDate = System.currentTimeMillis() +
            5 * 24 * 60 * 60 * 1000 +
            3 * 60 * 60 * 1000
        val result = CountdownFormatter.format(futureDate, isCountUp = false)

        assertEquals("5d 3h", result)
    }

    @Test
    fun `format shows just days when no extra hours`() {
        // Exactly 5 days from now
        val futureDate = System.currentTimeMillis() + 5 * 24 * 60 * 60 * 1000
        val result = CountdownFormatter.format(futureDate, isCountUp = false)

        assertEquals("5d", result)
    }

    @Test
    fun `format shows hours and minutes when less than 1 day`() {
        // 5 hours, 30 minutes from now
        val futureDate = System.currentTimeMillis() +
            5 * 60 * 60 * 1000 +
            30 * 60 * 1000
        val result = CountdownFormatter.format(futureDate, isCountUp = false)

        assertEquals("5h 30m", result)
    }

    @Test
    fun `format shows less than 5m when under 5 minutes`() {
        // 3 minutes from now
        val futureDate = System.currentTimeMillis() + 3 * 60 * 1000
        val result = CountdownFormatter.format(futureDate, isCountUp = false)

        assertEquals("<5m", result)
    }

    @Test
    fun `format shows less than 1m when under 1 minute`() {
        // 30 seconds from now
        val futureDate = System.currentTimeMillis() + 30 * 1000
        val result = CountdownFormatter.format(futureDate, isCountUp = false)

        assertEquals("<1m", result)
    }

    @Test
    fun `format shows checkmark when countdown is past`() {
        // 1 hour ago
        val pastDate = System.currentTimeMillis() - 1 * 60 * 60 * 1000
        val result = CountdownFormatter.format(pastDate, isCountUp = false)

        assertEquals("✓", result)
    }

    @Test
    fun `format shows weeks and days when more than 1 week`() {
        // 3 weeks, 2 days from now
        val futureDate = System.currentTimeMillis() +
            3 * 7 * 24 * 60 * 60 * 1000 +
            2 * 24 * 60 * 60 * 1000
        val result = CountdownFormatter.format(futureDate, isCountUp = false)

        assertEquals("3w 2d", result)
    }

    @Test
    fun `format shows years and weeks when more than 1 year`() {
        // ~1 year + 5 weeks (400 days)
        val futureDate = System.currentTimeMillis() + 400L * 24 * 60 * 60 * 1000
        val result = CountdownFormatter.format(futureDate, isCountUp = false)

        assertEquals("1y 5w", result)
    }

    // MARK: - format Tests (Count-Up Mode)

    @Test
    fun `countUp shows 0d when less than a day`() {
        // 5 hours ago
        val pastDate = System.currentTimeMillis() - 5 * 60 * 60 * 1000
        val result = CountdownFormatter.format(pastDate, isCountUp = true)

        assertEquals("0d", result)
    }

    @Test
    fun `countUp shows elapsed time without negative prefix`() {
        // 5 days, 3 hours ago
        val pastDate = System.currentTimeMillis() -
            5 * 24 * 60 * 60 * 1000 -
            3 * 60 * 60 * 1000
        val result = CountdownFormatter.format(pastDate, isCountUp = true)

        assertEquals("5d 3h", result)
    }

    @Test
    fun `countUp shows weeks for longer periods`() {
        // 15 days ago (2 weeks 1 day)
        val pastDate = System.currentTimeMillis() - 15 * 24 * 60 * 60 * 1000
        val result = CountdownFormatter.format(pastDate, isCountUp = true)

        assertEquals("2w 1d", result)
    }

    // MARK: - statusLabel Tests

    @Test
    fun `statusLabel returns Time Since for countUp`() {
        val result = CountdownFormatter.statusLabel(
            targetDate = System.currentTimeMillis() - 1000,
            isCountUp = true
        )
        assertEquals("Time Since", result)
    }

    @Test
    fun `statusLabel returns Completed for past countdown`() {
        val result = CountdownFormatter.statusLabel(
            targetDate = System.currentTimeMillis() - 1000,
            isCountUp = false
        )
        assertEquals("Completed", result)
    }

    @Test
    fun `statusLabel returns Countdown for active countdown`() {
        val result = CountdownFormatter.statusLabel(
            targetDate = System.currentTimeMillis() + 1000,
            isCountUp = false
        )
        assertEquals("Countdown", result)
    }

    // MARK: - isComplete Tests

    @Test
    fun `isComplete returns true when countdown is past`() {
        val result = CountdownFormatter.isComplete(
            targetDate = System.currentTimeMillis() - 1000,
            isCountUp = false
        )
        assertTrue(result)
    }

    @Test
    fun `isComplete returns false when countdown is future`() {
        val result = CountdownFormatter.isComplete(
            targetDate = System.currentTimeMillis() + 1000,
            isCountUp = false
        )
        assertFalse(result)
    }

    @Test
    fun `isComplete returns false for countUp regardless of time`() {
        val result = CountdownFormatter.isComplete(
            targetDate = System.currentTimeMillis() - 1000,
            isCountUp = true
        )
        assertFalse(result)
    }
}
