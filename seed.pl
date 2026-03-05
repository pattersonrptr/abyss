#!/usr/bin/perl
# ============================================================
#  LOOKING INTO THE ABYSS :: seed.pl
#  Populates questions.bin and answers.bin with seed data.
#  Run once from the project root:  perl seed.pl
#  XOR stream cipher + base64 — same key as frontend (script.js)
# ============================================================
use strict;
use warnings;
use FindBin qw($Bin);
use Fcntl qw(:flock SEEK_END);

my $FMT_Q = 'V V a1004';
my $SZ_Q  = 1012;
my $FMT_A = 'V V V a1004';
my $SZ_A  = 1016;

my $DIR    = "$Bin/data";
my $FILE_Q = "$DIR/questions.bin";
my $FILE_A = "$DIR/answers.bin";

my $KEY = "<L00k 1nto the Abyss>";

# XOR stream cipher + base64 (mirrors xorEncrypt in script.js)
sub encrypt {
    my ($text, $nonce) = @_;
    my $stream    = $KEY . $nonce;   # unique keystream per message
    my @str_bytes = map { ord($_) } split //, $stream;
    my $str_len   = scalar @str_bytes;
    my @bytes = map { ord($_) } split //, $text;
    my $out = '';
    for my $i (0 .. $#bytes) {
        $out .= chr($bytes[$i] ^ $str_bytes[$i % $str_len]);
    }
    return encode_base64($out);
}

# Pure-Perl base64 encoder (no MIME::Base64 dependency)
sub encode_base64 {
    my ($input) = @_;
    my @chars = ('A'..'Z','a'..'z','0'..'9','+','/');
    my $out = '';
    my @bytes = map { ord($_) } split //, $input;
    for (my $i = 0; $i < @bytes; $i += 3) {
        my $b0 = $bytes[$i];
        my $b1 = defined $bytes[$i+1] ? $bytes[$i+1] : 0;
        my $b2 = defined $bytes[$i+2] ? $bytes[$i+2] : 0;
        $out .= $chars[($b0 >> 2) & 0x3F];
        $out .= $chars[(($b0 & 0x03) << 4) | (($b1 >> 4) & 0x0F)];
        $out .= defined $bytes[$i+1] ? $chars[(($b1 & 0x0F) << 2) | (($b2 >> 6) & 0x03)] : '=';
        $out .= defined $bytes[$i+2] ? $chars[$b2 & 0x3F] : '=';
    }
    return $out;
}

# ============================================================

mkdir $DIR unless -d $DIR;
unlink $FILE_Q if -e $FILE_Q;
unlink $FILE_A if -e $FILE_A;

my @questions = (
    "If you could remove one human emotion forever, which would you choose? Would we lose something essential with it?",
    "Is there a real difference between a happy memory that never happened and one that did?",
    "Would you act differently if you were absolutely certain no one would ever find out what you did?",
    "What is more frightening: that the universe has a purpose, or that it has none?",
    "Is it possible to be completely honest without ever hurting anyone?",
);

# answers: [ [q_id, text], ... ]
my @answers = (
    [1, "Fear. But maybe without it there would be no courage -- only recklessness."],
    [1, "Nostalgia. It paralyzes more than it moves."],
    [2, "If you cannot distinguish them, they produce the same effects. Maybe it does not matter."],
    [4, "A purpose implies someone defined it. I prefer the void -- at least it belongs to me."],
    [4, "The purpose. The void is comforting. A script written before you existed is terrifying."],
    [4, "Both are equally frightening. The question has no good way out."],
    [5, "No. Complete honesty is a form of controlled violence."],
);

# write questions
open(my $fq, '+>:raw', $FILE_Q) or die "Cannot write $FILE_Q: $!";
flock($fq, LOCK_EX);
for my $i (0 .. $#questions) {
    my $id  = $i + 1;
    my $ts  = time();
    my $b64 = encrypt($questions[$i], $ts);
    print $fq pack($FMT_Q, $id, $ts, $b64);
    printf "Q%d: %s\n", $id, $questions[$i];
}
flock($fq, LOCK_UN);
close($fq);

# write answers
open(my $fa, '+>:raw', $FILE_A) or die "Cannot write $FILE_A: $!";
flock($fa, LOCK_EX);
for my $i (0 .. $#answers) {
    my $aid  = $i + 1;
    my $q_id = $answers[$i][0];
    my $ts   = time();
    my $b64  = encrypt($answers[$i][1], $ts);
    print $fa pack($FMT_A, $aid, $q_id, $ts, $b64);
    printf "A%d (Q%d): %s\n", $aid, $q_id, $answers[$i][1];
}
flock($fa, LOCK_UN);
close($fa);

printf "\nDone: %d questions, %d answers\n", scalar @questions, scalar @answers;
