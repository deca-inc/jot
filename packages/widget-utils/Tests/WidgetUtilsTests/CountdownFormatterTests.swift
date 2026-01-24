import XCTest
@testable import WidgetUtils

// Time constants to avoid complex expressions
private let minute: TimeInterval = 60
private let hour: TimeInterval = 3600
private let day: TimeInterval = 86400
private let week: TimeInterval = 604800
// Buffer to avoid timing boundary issues (45 seconds)
private let buffer: TimeInterval = 45

final class CountdownFormatterTests: XCTestCase {

    // MARK: - calculateTimeRemaining Tests

    func testCalculateTimeRemainingForFutureDate() {
        let futureDate = Date().addingTimeInterval(5 * day + buffer)
        let result = CountdownFormatter.calculateTimeRemaining(targetDate: futureDate)

        XCTAssertFalse(result.isPast)
        XCTAssertEqual(result.days, 5)
    }

    func testCalculateTimeRemainingForPastDate() {
        let pastDate = Date().addingTimeInterval(-2 * day - buffer)
        let result = CountdownFormatter.calculateTimeRemaining(targetDate: pastDate)

        XCTAssertTrue(result.isPast)
        XCTAssertEqual(result.days, 2)
    }

    func testCalculateTimeRemainingForCurrentTime() {
        let result = CountdownFormatter.calculateTimeRemaining(targetDate: Date())

        XCTAssertEqual(result.days, 0)
        XCTAssertEqual(result.hours, 0)
        XCTAssertEqual(result.minutes, 0)
    }

    func testCalculateTotalMinutesCorrectly() {
        // 1 day + 2 hours + 30.5 minutes = 1590 minutes (with buffer for rounding)
        let futureDate = Date().addingTimeInterval(day + 2 * hour + 30 * minute + buffer)
        let result = CountdownFormatter.calculateTimeRemaining(targetDate: futureDate)

        XCTAssertEqual(result.totalMinutes, 1590)
    }

    // MARK: - format Tests (Countdown Mode)

    func testFormatShowsDaysAndHours() {
        let futureDate = Date().addingTimeInterval(5 * day + 3 * hour + buffer)
        let result = CountdownFormatter.format(targetDate: futureDate, isCountUp: false)

        XCTAssertEqual(result, "5d 3h")
    }

    func testFormatShowsJustDays() {
        // 5 days + 30 min buffer (still shows "5d" since < 1 hour)
        let futureDate = Date().addingTimeInterval(5 * day + 30 * minute)
        let result = CountdownFormatter.format(targetDate: futureDate, isCountUp: false)

        XCTAssertEqual(result, "5d")
    }

    func testFormatShowsHoursAndMinutes() {
        let futureDate = Date().addingTimeInterval(5 * hour + 30 * minute + buffer)
        let result = CountdownFormatter.format(targetDate: futureDate, isCountUp: false)

        XCTAssertEqual(result, "5h 30m")
    }

    func testFormatShowsLessThan5Minutes() {
        let futureDate = Date().addingTimeInterval(3 * minute + buffer)
        let result = CountdownFormatter.format(targetDate: futureDate, isCountUp: false)

        XCTAssertEqual(result, "<5m")
    }

    func testFormatShowsLessThan1Minute() {
        let futureDate = Date().addingTimeInterval(30)
        let result = CountdownFormatter.format(targetDate: futureDate, isCountUp: false)

        XCTAssertEqual(result, "<1m")
    }

    func testFormatShowsCheckmarkWhenPast() {
        let pastDate = Date().addingTimeInterval(-1 * hour - buffer)
        let result = CountdownFormatter.format(targetDate: pastDate, isCountUp: false)

        XCTAssertEqual(result, "✓")
    }

    func testFormatShowsWeeksAndDays() {
        let futureDate = Date().addingTimeInterval(3 * week + 2 * day + buffer)
        let result = CountdownFormatter.format(targetDate: futureDate, isCountUp: false)

        XCTAssertEqual(result, "3w 2d")
    }

    func testFormatShowsYearsAndWeeks() {
        // 1 year + 5 weeks + 3 days to avoid boundary issues
        let futureDate = Date().addingTimeInterval(403 * day + buffer)
        let result = CountdownFormatter.format(targetDate: futureDate, isCountUp: false)

        XCTAssertEqual(result, "1y 5w")
    }

    // MARK: - format Tests (Count-Up Mode)

    func testCountUpShowsZeroDaysWhenLessThanADay() {
        let pastDate = Date().addingTimeInterval(-5 * hour - buffer)
        let result = CountdownFormatter.format(targetDate: pastDate, isCountUp: true)

        XCTAssertEqual(result, "0d")
    }

    func testCountUpShowsElapsedTimeWithoutNegative() {
        let pastDate = Date().addingTimeInterval(-5 * day - 3 * hour - buffer)
        let result = CountdownFormatter.format(targetDate: pastDate, isCountUp: true)

        XCTAssertEqual(result, "5d 3h")
    }

    func testCountUpShowsWeeksForLongerPeriods() {
        let pastDate = Date().addingTimeInterval(-15 * day - buffer)
        let result = CountdownFormatter.format(targetDate: pastDate, isCountUp: true)

        XCTAssertEqual(result, "2w 1d")
    }

    // MARK: - statusLabel Tests

    func testStatusLabelForCountUp() {
        let result = CountdownFormatter.statusLabel(
            targetDate: Date().addingTimeInterval(-1000),
            isCountUp: true
        )
        XCTAssertEqual(result, "Time Since")
    }

    func testStatusLabelForCompletedCountdown() {
        let result = CountdownFormatter.statusLabel(
            targetDate: Date().addingTimeInterval(-1000),
            isCountUp: false
        )
        XCTAssertEqual(result, "Completed")
    }

    func testStatusLabelForActiveCountdown() {
        let result = CountdownFormatter.statusLabel(
            targetDate: Date().addingTimeInterval(1000),
            isCountUp: false
        )
        XCTAssertEqual(result, "Countdown")
    }

    // MARK: - isComplete Tests

    func testIsCompleteReturnsTrueWhenPast() {
        let result = CountdownFormatter.isComplete(
            targetDate: Date().addingTimeInterval(-1000),
            isCountUp: false
        )
        XCTAssertTrue(result)
    }

    func testIsCompleteReturnsFalseWhenFuture() {
        let result = CountdownFormatter.isComplete(
            targetDate: Date().addingTimeInterval(1000),
            isCountUp: false
        )
        XCTAssertFalse(result)
    }

    func testIsCompleteReturnsFalseForCountUp() {
        let result = CountdownFormatter.isComplete(
            targetDate: Date().addingTimeInterval(-1000),
            isCountUp: true
        )
        XCTAssertFalse(result)
    }
}
