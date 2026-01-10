Pod::Spec.new do |s|
  s.name           = 'WidgetBridge'
  s.version        = '1.0.0'
  s.summary        = 'Bridge for syncing countdown data to iOS/Android widgets'
  s.description    = 'Native module for syncing countdown data between React Native and native widgets'
  s.authors        = { 'Beta Zeta' => 'dev@betazeta.com' }
  s.homepage       = 'https://github.com/betazeta/jot'
  s.license        = { :type => 'MIT', :text => 'MIT License' }
  s.platforms      = { :ios => '14.0' }
  s.source         = { :git => 'https://github.com/betazeta/jot.git', :tag => s.version.to_s }
  s.static_framework = true
  s.source_files   = '*.swift'
  s.dependency 'ExpoModulesCore'
  s.swift_version  = '5.4'
end
