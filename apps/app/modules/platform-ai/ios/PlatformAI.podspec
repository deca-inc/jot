Pod::Spec.new do |s|
  s.name           = 'PlatformAI'
  s.version        = '1.0.0'
  s.summary        = 'Native bridge for platform AI models (Apple Foundation Models, Gemini Nano)'
  s.description    = 'Expo module for using built-in AI models on iOS (Apple Foundation Models) and Android (Gemini Nano)'
  s.authors        = { 'Beta Zeta' => 'dev@betazeta.com' }
  s.homepage       = 'https://github.com/betazeta/jot'
  s.license        = { :type => 'MIT', :text => 'MIT License' }
  s.platforms      = { :ios => '15.0' }
  s.source         = { :git => 'https://github.com/betazeta/jot.git', :tag => s.version.to_s }
  s.static_framework = true
  s.source_files   = '*.swift'
  s.dependency 'ExpoModulesCore'
  s.swift_version  = '5.9'
end
