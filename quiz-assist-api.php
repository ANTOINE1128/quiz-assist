<?php
/**
 * Plugin Name: Quiz Assist
 * Description: AI‑powered quiz & site assistant for FarhatLectures.
 * Version:     1.8
 * Author:      Antoine Makdessy
 */

if ( ! defined('ABSPATH') ) exit;

define( 'QA_DIR', __DIR__ . '/' );
define( 'QA_URL', plugin_dir_url( __FILE__ ) );

// Load core files
require_once QA_DIR . 'includes/utils.php';
require_once QA_DIR . 'includes/settings.php';
require_once QA_DIR . 'includes/admin-pages.php';
require_once QA_DIR . 'includes/api-quiz.php';
require_once QA_DIR . 'includes/api-global.php';

// Enqueue assets
add_action('wp_enqueue_scripts', function(){
    // Quiz widget
    wp_enqueue_script(
      'qa-quiz-widget',
      QA_URL . 'assets/js/quiz-widget.js',
      [], 
      filemtime( QA_DIR . 'assets/js/quiz-widget.js' ),
      true
    );
    wp_localize_script(
      'qa-quiz-widget',
      'QA_Assist_Quiz_Settings',
      ['apiBase' => rest_url('quiz-assist/v1')]
    );

    // Global widget
    wp_enqueue_script(
      'qa-global-widget',
      QA_URL . 'assets/js/global-widget.js',
      ['wp-element'],
      filemtime( QA_DIR . 'assets/js/global-widget.js' ),
      true
    );
    wp_localize_script(
      'qa-global-widget',
      'QA_Assist_Global_Settings',
      ['apiBase' => rest_url('quiz-assist/v1')]
    );
});
