import WidgetKit
import SwiftUI

@main
struct JotWidgetBundle: WidgetBundle {
    var body: some Widget {
        CountdownWidget()
        JotWidget()
    }
}
