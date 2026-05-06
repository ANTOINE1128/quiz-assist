<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Preserve safe HTML for FAQs inside the quiz_assist_options option.
 * Allows links, lists, headings, tables, etc.
 */
add_filter('pre_update_option_quiz_assist_options', function($value, $old_value){
    if ( ! is_array($value) || empty($value['qa_faqs']) || ! is_array($value['qa_faqs']) ) {
        return $value; // nothing to do
    }

    $allowed = [
        'p' => ['class' => []],
        'br' => [],
        'strong' => [], 'b' => [], 'em' => [], 'i' => [], 'u' => [],
        'h1' => [], 'h2' => [], 'h3' => [], 'h4' => [],
        'ul' => ['class' => []], 'ol' => ['class' => []], 'li' => ['class' => []],
        'a' => ['href' => [], 'target' => [], 'rel' => [], 'class' => []],
        'div' => ['class' => []], 'span' => ['class' => []],
        'table' => ['class' => []], 'thead' => [], 'tbody' => [], 'tr' => [],
        'th' => ['scope' => [], 'colspan' => [], 'rowspan' => []],
        'td' => ['colspan' => [], 'rowspan' => []],
        'hr' => [],
        'code' => [], 'pre' => [],
    ];

    foreach ($value['qa_faqs'] as $i => $faq) {
        if (isset($faq['q'])) {
            $value['qa_faqs'][$i]['q'] = wp_kses( (string)$faq['q'], $allowed );
        }
        if (isset($faq['a'])) {
            $value['qa_faqs'][$i]['a'] = wp_kses( (string)$faq['a'], $allowed );
        }
    }
    return $value;
}, 10, 2);
