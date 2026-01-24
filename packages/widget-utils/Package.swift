// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "WidgetUtils",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "WidgetUtils",
            targets: ["WidgetUtils"]
        ),
    ],
    targets: [
        .target(
            name: "WidgetUtils",
            dependencies: []
        ),
        .testTarget(
            name: "WidgetUtilsTests",
            dependencies: ["WidgetUtils"]
        ),
    ]
)
