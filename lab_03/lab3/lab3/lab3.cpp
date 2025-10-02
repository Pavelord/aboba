#include <iostream>

int main() {
    int i; 
    int x; 

    std::cout << "enter i: ";
    std::cin >> i;

    std::cout << "enter x: ";
    std::cin >> x;

    int bit = (x >> i) & 1; 

    std::cout << "i-th bit of number x: " << bit << std::endl;

    return 0;
}
