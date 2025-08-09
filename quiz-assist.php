<?php
/**
 * Plugin Name: Quiz Assist
 * Description: AI-powered quiz & site assistant for FarhatLectures.
 * Version:     2.3
 * Author:      Antoine Makdessy
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'QA_DIR', __DIR__ . '/' );
define( 'QA_URL', plugin_dir_url( __FILE__ ) );

/**
 * Activation: create sessions + messages tables (with metadata)
 */
register_activation_hook( __FILE__, 'qa_install' );
function qa_install() {
    global $wpdb;
    $charset = $wpdb->get_charset_collate();
    $sess    = $wpdb->prefix . 'qa_chat_sessions';
    $msgs    = $wpdb->prefix . 'qa_chat_messages';
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    // sessions table: user_id or guest fields
    dbDelta( "
    CREATE TABLE {$sess} (
      id mediumint(9) NOT NULL AUTO_INCREMENT,
      created_at datetime NOT NULL,
      user_id mediumint(9) DEFAULT 0,
      guest_name varchar(100) DEFAULT '',
      guest_phone varchar(20) DEFAULT '',
      guest_email varchar(100) DEFAULT '',
      PRIMARY KEY (id)
    ) {$charset};
    " );

    // messages table
    dbDelta( "
    CREATE TABLE {$msgs} (
      id mediumint(9) NOT NULL AUTO_INCREMENT,
      session_id mediumint(9) NOT NULL,
      sender varchar(20) NOT NULL,
      message text NOT NULL,
      created_at datetime NOT NULL,
      is_read tinyint(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      KEY session_id (session_id)
    ) {$charset};
    " );
}

/** Core includes (keep your existing files) */
require_once QA_DIR . 'includes/utils.php';
require_once QA_DIR . 'includes/settings.php';
require_once QA_DIR . 'includes/admin-pages.php';
require_once QA_DIR . 'includes/api-quiz.php';
require_once QA_DIR . 'api-chat.php';

/**
 * Front-end assets
 */
add_action( 'wp_enqueue_scripts', function () {

    // 1) Quiz widget
    wp_enqueue_script(
        'qa-quiz-widget',
        QA_URL . 'assets/js/quiz-widget.js',
        [],
        filemtime( QA_DIR . 'assets/js/quiz-widget.js' ),
        true
    );
    wp_enqueue_style(
        'qa-quiz-widget-css',
        QA_URL . 'assets/css/quiz-widget.css',
        [],
        filemtime( QA_DIR . 'assets/css/quiz-widget.css' )
    );

    $opts = get_option( 'quiz_assist_options', [] );
    wp_localize_script(
        'qa-quiz-widget',
        'QA_Assist_Quiz_Settings',
        [
            'apiBase'     => rest_url( 'quiz-assist/v1' ),
            'quizActions' => $opts['qa_quiz_actions'] ?? [],
        ]
    );

    // 2) Global chat widget — DO NOT load on quiz pages
    if ( strpos( $_SERVER['REQUEST_URI'] ?? '', '/quizzes/' ) === false ) {

        wp_enqueue_script(
            'qa-global-widget',
            QA_URL . 'assets/js/global-widget.js',
            ['wp-element'],
            filemtime( QA_DIR . 'assets/js/global-widget.js' ),
            true
        );

        wp_enqueue_style(
            'qa-global-widget-css',
            QA_URL . 'assets/css/global-widget.css',
            [],
            filemtime( QA_DIR . 'assets/css/global-widget.css' )
        );

        wp_localize_script(
  'qa-global-widget',
  'QA_Assist_Global_SETTINGS',
  [
    'apiBase'        => rest_url( 'quiz-assist/v1' ),
    'pollInterval'   => 2000,
    'isUserLoggedIn' => is_user_logged_in(),
    'currentUserName'=> is_user_logged_in() ? wp_get_current_user()->user_login : '',
    'restNonce'      => wp_create_nonce('wp_rest'), // ← ADD THIS
  ]
);
    }
});

/**
 * Mount chat container (only where we enqueue it)
 */
add_action( 'wp_footer', function () {
    if ( strpos( $_SERVER['REQUEST_URI'] ?? '', '/quizzes/' ) !== false ) {
        // quiz pages: no global chat
        return;
    }
    echo '<div id="qa-global-root"></div>';
} );
