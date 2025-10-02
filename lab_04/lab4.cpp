#include <iostream>

int main() {
    /* Variant 9.1
       Task: Enter natural numbers A, B, C.
       If A > B and B > C -> print A - B - C
       If B > A and B is divisible by C -> print B / C + B - A
       Otherwise -> print A + B + C
    */
    /*
    int A, B, C;
    std::cout << "Enter A, B, C: ";
    std::cin >> A >> B >> C;
    std::cout << std::endl;

    if ((A > B) && (B > C)) {
        std::cout << (A - B - C) << std::endl;
    }
    else if ((B > A) && (C != 0) && (B % C == 0)) {
        std::cout << (B / C + B - A) << std::endl;
    }
    else {
        std::cout << (A + B + C) << std::endl;
    }
    */

    /* Variant 9.2
       Task: Enter an error number N and decode it using switch:
       0 - Everything OK
       1 - File read error
       2 - File write error
       3 - Not all fields defined
       Handle wrong input (default case).
    */
    /*
    int N;
    std::cout << "Enter error code (0..3): ";
    std::cin >> N;
    std::cout << std::endl;

    switch (N) {
        case 0:
            std::cout << "Everything is OK" << std::endl;
            break;
        case 1:
            std::cout << "File read error" << std::endl;
            break;
        case 2:
            std::cout << "File write error" << std::endl;
            break;
        case 3:
            std::cout << "Not all fields defined" << std::endl;
            break;
        default:
            std::cout << "Unknown error" << std::endl;
            break;
    }
    */

    /* Variant 9.3
       Task: Variable x can be -1 or 1.
       If -1 -> print "Negative number"
       If 1  -> print "Positive number"
       Otherwise -> print "Wrong input"

       Proposed simple variant: use int input and if-else.
       Reason: only two valid values, if-else is simple and clear.
    */
    /*
    int x;
    std::cout << "Enter number (-1 or 1): ";
    std::cin >> x;
    std::cout << std::endl;

    if (x == -1) {
        std::cout << "Negative number" << std::endl;
    }
    else if (x == 1) {
        std::cout << "Positive number" << std::endl;
    }
    else {
        std::cout << "Wrong input" << std::endl;
    }
    */

    return 0;
}
