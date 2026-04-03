Pod::Spec.new do |s|
  s.name           = 'SparkleUpdater'
  s.version        = '1.0.0'
  s.summary        = 'Native bridge for Sparkle auto-update framework on macOS'
  s.description    = 'Expo module for integrating Sparkle auto-updates in macOS apps'
  s.authors        = { 'Beta Zeta' => 'dev@betazeta.com' }
  s.homepage       = 'https://github.com/betazeta/jot'
  s.license        = { :type => 'MIT', :text => 'MIT License' }
  s.platforms      = { :ios => '15.0', :osx => '12.0' }
  s.source         = { :git => 'https://github.com/betazeta/jot.git', :tag => s.version.to_s }
  s.static_framework = true
  s.source_files   = '*.swift'
  s.dependency 'ExpoModulesCore'
  s.swift_version  = '5.9'

  # Sparkle is only available on macOS
  s.osx.dependency 'Sparkle', '~> 2.0'
end
