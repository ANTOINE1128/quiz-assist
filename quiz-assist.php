<?php
/**
 * Plugin Name: Quiz Assist
 * Description: Quiz widget + site chat (guest/user) for FarhatLectures.
 * Version:     2.5
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'QA_DIR', __DIR__ . '/' );
define( 'QA_URL', plugin_dir_url( __FILE__ ) );
define( 'QA_VER', '2.5' );

/**
 * Helpers: detect LearnDash pages (Quiz / Topic)
 */
function qa_is_quiz_view() {
    if ( function_exists( 'learndash_is_quiz_post' ) && is_singular() ) {
        global $post;
        if ( $post && learndash_is_quiz_post( $post->ID ) ) return true;
    }
    if ( function_exists( 'learndash_get_post_type_slug' ) ) {
        $quiz_pt = learndash_get_post_type_slug( 'quiz' );
        if ( $quiz_pt && is_singular( $quiz_pt ) ) return true;
    }
    return is_singular( 'sfwd-quiz' );
}

function qa_is_topic_view() {
    if ( function_exists( 'learndash_is_topic_post' ) && is_singular() ) {
        global $post;
        if ( $post && learndash_is_topic_post( $post->ID ) ) return true;
    }
    if ( function_exists( 'learndash_get_post_type_slug' ) ) {
        $topic_pt = learndash_get_post_type_slug( 'topic' );
        if ( $topic_pt && is_singular( $topic_pt ) ) return true;
    }
    return is_singular( 'sfwd-topic' );
}

/**
 * Activation: create sessions + messages tables
 */
register_activation_hook( __FILE__, 'qa_install' );
function qa_install() {
    global $wpdb;
    $charset = $wpdb->get_charset_collate();
    $sess    = $wpdb->prefix . 'qa_chat_sessions';
    $msgs    = $wpdb->prefix . 'qa_chat_messages';
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

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

/** Includes */
require_once QA_DIR . 'includes/utils.php';
require_once QA_DIR . 'includes/settings.php';
require_once QA_DIR . 'includes/admin-pages.php';
require_once QA_DIR . 'includes/api-quiz.php';
require_once QA_DIR . 'includes/api-chat.php';

/**
 * Front-end assets (load per-page correctly)
 */
add_action( 'wp_enqueue_scripts', function() {
    $is_quiz  = qa_is_quiz_view();
    $is_topic = qa_is_topic_view();

    // ========= QUIZ WIDGET (only on quiz pages) =========
    if ( $is_quiz ) {
        wp_enqueue_script(
          'qa-quiz-widget',
          QA_URL . 'assets/js/quiz-widget.js',
          ['wp-element'],
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
    }

    // ========= GLOBAL CHAT (everywhere EXCEPT quiz & topic pages) =========
    if ( ! $is_quiz && ! $is_topic ) {
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

        $opts = get_option( 'quiz_assist_options', [] );
        wp_localize_script(
          'qa-global-widget',
          'QA_Assist_Global_SETTINGS',
          [
            'apiBase'         => rest_url( 'quiz-assist/v1' ),
            'pollInterval'    => 2000,
            'isUserLoggedIn'  => is_user_logged_in(),
            'currentUserName' => is_user_logged_in() ? wp_get_current_user()->user_login : '',
            'restNonce'       => wp_create_nonce( 'wp_rest' ),
            // NEW: pass quick replies
            'globalActions'   => $opts['qa_global_actions'] ?? [],
          ]
        );
    }
} );

/**
 * Mount chat container only when NOT on quiz or topic pages
 */
add_action( 'wp_footer', function(){
    if ( ! qa_is_quiz_view() && ! qa_is_topic_view() ) {
        echo '<div id="qa-global-root"></div>';
    }
} );
